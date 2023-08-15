import 'dotenv/config'
import { open } from 'lmdb'
import { ethers } from 'ethers'
import { program } from 'commander'
import { readFileSync, readdirSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const rocketStorageAddress = '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46'

program.option('-r, --rpc <url>', 'Full node RPC endpoint URL')
       .option('-b, --bn <url>', 'Beacon node API endpoint URL')
       .requiredOption('-s, --slot <num>', 'Slot to print info for')
program.parse()
const options = program.opts()

const dbDir = process.env.DB_DIR || 'db'
const db = open({path: dbDir})

const provider = new ethers.JsonRpcProvider(options.rpc || process.env.RPC || 'http://localhost:8545')
const beaconRpcUrl = options.bn || process.env.BN_URL || 'http://localhost:5052'

const nullAddress = '0x0000000000000000000000000000000000000000'
const rocketStorage = new ethers.Contract(rocketStorageAddress,
  ['function getAddress(bytes32) view returns (address)'], provider)
const getRocketAddress = name => rocketStorage['getAddress(bytes32)'](ethers.id(`contract.address${name}`))
const rocketMinipoolManager = new ethers.Contract(
  await getRocketAddress('rocketMinipoolManager'),
  ['function getMinipoolByPubkey(bytes) view returns (address)'], provider)

async function isRocketPoolValidator(index) {
  const path = `/eth/v1/beacon/states/finalized/validators/${index}`
  const url = new URL(path, beaconRpcUrl)
  const response = await fetch(url)
  if (response.status !== 200) {
    console.warn(`Unexpected response status getting ${index} pubkey: ${response.status}`)
    console.warn(`response text: ${await response.text()}`)
  }
  const json = await response.json()
  const minipool = await rocketMinipoolManager.getMinipoolByPubkey(json.data.validator.pubkey)
  return minipool != nullAddress
}

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
  const proposerIndex = json.data.message.proposer_index
  const rocketPool = await isRocketPoolValidator(proposerIndex)
  const result = {blockNumber, proposerIndex, rocketPool, gasUsed, baseFeePerGas, feesPaid, feeRecipient, feeReceived}
  await db.put(slotNumber, result)
  return result
}

const slotNumber = parseInt(options.slot)
const dataDir = readdirSync('data')
const bidValuesFile = dataDir.find(x => {
  const m = x.match(/bid-values_slot-(\d+)-to-(\d+).json.gz$/)
  return m.length && parseInt(m[1]) <= slotNumber && slotNumber <= parseInt(m[2])
})
const bidInfo = JSON.parse(gunzipSync(readFileSync(`data/${bidValuesFile}`)))
const bidValues = (bidInfo[slotNumber] || []).map(s => BigInt(s))
console.log(`Slot ${slotNumber}: got ${bidValues.length} bids`)
const maxBid = bidValues.reduce((acc, bid) => bid > acc ? bid : acc, 0n)
console.log(`Max flashbots bid value: ${ethers.formatEther(maxBid)} ETH`)
const info = await getSlotInfo(slotNumber)
info.totalBase = info.baseFeePerGas * info.gasUsed
info.totalPriority = info.feesPaid - info.totalBase
console.log(`Fees paid over base fee: ${ethers.formatEther(info.totalPriority)} ETH`)
console.log(`Proposer index ${info.proposerIndex} (RP: ${info.rocketPool})`)
