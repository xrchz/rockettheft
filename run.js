import 'dotenv/config'
import { open } from 'lmdb'
import { ethers } from 'ethers'
import { program } from 'commander'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const dbDir = process.env.DB_DIR || 'db'
const db = open({path: dbDir})

const provider = new ethers.JsonRpcProvider(process.env.RPC || 'http://localhost:8545')
const beaconRpcUrl = process.env.BN_URL || 'http://localhost:5052'

async function getSlotInfo(slotNumberAny) {
  const slotNumber = parseInt(slotNumberAny)
  const cached = db.get(slotNumber)
  if (cached) return cached
  const path = `/eth/v1/beacon/blinded_blocks/${slotNumber}`
  const url = new URL(path, beaconRpcUrl)
  const response = await fetch(url)
  if (response.status !== 200) {
    console.warn(`Unexpected response status getting ${slotNumber} block: ${response.status}`)
    console.warn(`response text: ${await response.text()}`)
  }
  const json = await response.json()
  if (!('execution_payload_header' in json.data.message.body &&
        parseInt(json.data.message.body.execution_payload_header.block_number))) {
    console.warn(`${slotNumber} has no associated post-merge block`)
    const result = {blockNumber: null}
    await db.put(slotNumber, result)
    return result
  }
  const blockNumber = parseInt(json.data.message.body.execution_payload_header.block_number)
  const block = await provider.getBlock(blockNumber)
  const gasUsed = block.gasUsed
  const baseFeePerGas = block.baseFeePerGas
  let feesPaid = 0n
  let lastTx = block.transactions.length - 1
  for (const hash of block.transactions) {
    const receipt = await provider.getTransactionReceipt(hash)
    feesPaid += receipt.gasUsed * receipt.gasPrice
    if (receipt.index == lastTx)
      lastTx = await provider.getTransaction(hash)
  }
  const feeRecipient = ethers.getAddress(json.data.message.body.execution_payload_header.fee_recipient)
  const feeReceived = lastTx.from == feeRecipient ? lastTx.value : 0n
  const result = {blockNumber, gasUsed, baseFeePerGas, feesPaid, feeRecipient, feeReceived}
  await db.put(slotNumber, result)
  return result
}

const slotNumber = 5000004
const info = await getSlotInfo(slotNumber)
info.totalBase = info.baseFeePerGas * info.gasUsed
info.totalPriority = info.feesPaid - info.totalBase
console.log(info)
process.exit()

const data = JSON.parse(gunzipSync(readFileSync('data/builder-submissions_slot-5000001-to-5002500.json.gz')))
console.log(data.length)
const nonzeros = []
for (const item of data)
  if (item.proposer_pubkey != '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000')
    nonzeros.push(item)
console.log(nonzeros.length)
