import 'dotenv/config'
import { open } from 'lmdb'
import { ethers } from 'ethers'
import { program } from 'commander'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

program.option('-r, --rpc <url>', 'Full node RPC endpoint URL')
       .option('-b, --bn <url>', 'Beacon node API endpoint URL')
       .requiredOption('-s, --slot <num>', 'Slot to print info for')
program.parse()
const options = program.opts()

const dbDir = process.env.DB_DIR || 'db'
const db = open({path: dbDir})

const provider = new ethers.JsonRpcProvider(options.rpc || process.env.RPC || 'http://localhost:8545')
const beaconRpcUrl = options.bn || process.env.BN_URL || 'http://localhost:5052'

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

const slotNumber = parseInt(options.slot)
const bidInfo = JSON.parse(gunzipSync(readFileSync('data/bid-values_slot-6202501-to-6206500.json.gz')))
const bidValues = (bidInfo[slotNumber] || []).map(s => BigInt(s))
console.log(`Slot ${slotNumber}: got ${bidValues.length} bids`)
const maxBid = bidValues.reduce((acc, bid) => bid > acc ? bid : acc, 0n)
console.log(`Max flashbots bid value: ${ethers.formatEther(maxBid)} ETH`)
const info = await getSlotInfo(slotNumber)
info.totalBase = info.baseFeePerGas * info.gasUsed
info.totalPriority = info.feesPaid - info.totalBase
console.log(`Fees paid over base fee: ${ethers.formatEther(info.totalPriority)} ETH`)

const data = JSON.parse(gunzipSync(readFileSync('data/builder-submissions_slot-5000001-to-5002500.json.gz')))
console.log(data.length)
const nonzeros = []
for (const item of data)
  if (item.proposer_pubkey != '0x000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000')
    nonzeros.push(item)
console.log(nonzeros.length)
