import 'dotenv/config'
import { open } from 'lmdb'
import { ethers } from 'ethers'
import { program } from 'commander'
import { readFileSync, readdirSync, createWriteStream } from 'node:fs'
import { gunzipSync } from 'node:zlib'

const rocketStorageAddress = '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46'

program.option('-r, --rpc <url>', 'Full node RPC endpoint URL')
       .option('-b, --bn <url>', 'Beacon node API endpoint URL')
       .requiredOption('-s, --slot <num>', 'First slot to get info for')
       .option('-t, --to-slot <num>', 'Last slot to get info for (default: --slot)')
       .option('--no-cache', 'Do not use the slot info cache')
program.parse()
const options = program.opts()

const dbDir = process.env.DB_DIR || 'db'
const db = open({path: dbDir})

const provider = new ethers.JsonRpcProvider(options.rpc || process.env.RPC_URL || 'http://localhost:8545')
const beaconRpcUrl = options.bn || process.env.BN_URL || 'http://localhost:5052'

const nullAddress = '0x0000000000000000000000000000000000000000'
const rocketStorage = new ethers.Contract(rocketStorageAddress,
  ['function getAddress(bytes32) view returns (address)'], provider)
const getRocketAddress = (name, blockTag) => rocketStorage['getAddress(bytes32)'](ethers.id(`contract.address${name}`), blockTag ? {blockTag} : {})

const rocketNodeDistributorFactory = new ethers.Contract(
  await getRocketAddress('rocketNodeDistributorFactory'),
  ['function getProxyAddress(address) view returns (address)'], provider)

async function getMinipoolAddress(index, blockTag) {
  const path = `/eth/v1/beacon/states/finalized/validators/${index}`
  const url = new URL(path, beaconRpcUrl)
  const response = await fetch(url)
  if (response.status !== 200) {
    console.warn(`Unexpected response status getting ${index} pubkey: ${response.status}`)
    console.warn(`response text: ${await response.text()}`)
  }
  const json = await response.json()
  const rocketMinipoolManager = new ethers.Contract(
    await getRocketAddress('rocketMinipoolManager', blockTag),
    ['function getMinipoolByPubkey(bytes) view returns (address)'], provider)
  return await rocketMinipoolManager.getMinipoolByPubkey(json.data.validator.pubkey, {blockTag})
}

async function getCorrectFeeRecipient(minipoolAddress, blockTag) {
  const minipool = new ethers.Contract(
    minipoolAddress,
    ['function getNodeAddress() view returns (address)'], provider)
  const nodeAddress = await minipool.getNodeAddress()
  const rocketNodeManager = new ethers.Contract(
    await getRocketAddress('rocketNodeManager', blockTag),
    ['function getSmoothingPoolRegistrationState(address) view returns (bool)'], provider)
  const inSP = await rocketNodeManager.getSmoothingPoolRegistrationState(nodeAddress, {blockTag})
  const SPAddress = await getRocketAddress('rocketSmoothingPool', blockTag)
  return inSP ? SPAddress : await rocketNodeDistributorFactory.getProxyAddress(nodeAddress)
}

async function getSlotInfo(slotNumberAny) {
  const slotNumber = parseInt(slotNumberAny)
  const cached = db.get(slotNumber)
  if (options.cache && cached) return cached
  const path = `/eth/v1/beacon/blinded_blocks/${slotNumber}`
  const url = new URL(path, beaconRpcUrl)
  const response = await fetch(url)
  if (response.status === 404) {
    const result = {blockNumber: null}
    await db.put(slotNumber, result)
    return result
  }
  else if (response.status !== 200) {
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
  const {feeReceived, mevFeeRecipient} = lastTx.from == feeRecipient ?
    {feeReceived: lastTx.value, mevFeeRecipient: lastTx.to} :
    {feeReceived: 0n, mevFeeRecipient: null}
  const proposerIndex = json.data.message.proposer_index
  const minipoolAddress = await getMinipoolAddress(proposerIndex, blockNumber)
  const result = {blockNumber, proposerIndex, minipoolAddress, gasUsed, baseFeePerGas,
                  feesPaid, feeRecipient, mevFeeRecipient, feeReceived}
  await db.put(slotNumber, result)
  return result
}

const firstSlot = parseInt(options.slot)
const lastSlot = options.toSlot ? parseInt(options.toSlot) : firstSlot
if (lastSlot < firstSlot) throw new Error(`invalid slot range: ${firstSlot}-${lastSlot}`)
const dataDir = readdirSync('data')

const maxBidForSlot = new Map()
async function getMaxBidForSlot(slotNumber) {
  if (maxBidForSlot.has(slotNumber)) return maxBidForSlot.get(slotNumber)
  const bidValuesFile = dataDir.find(x => {
    const m = x.match(/bid-values_slot-(\d+)-to-(\d+).json.gz$/)
    return m && m.length && parseInt(m[1]) <= slotNumber && slotNumber <= parseInt(m[2])
  })
  if (!bidValuesFile)
    throw new Error(`no bid values file for slot ${slotNumber}`)
  const bidInfo = JSON.parse(gunzipSync(readFileSync(`data/${bidValuesFile}`)))
  const bidValues = (bidInfo[slotNumber] || []).map(s => BigInt(s))
  const maxBid = bidValues.reduce((acc, bid) => bid > acc ? bid : acc, 0n)
  const result = {maxBid, numBids: bidValues.length}
  maxBidForSlot.set(slotNumber, result)
  return result
}

const fileName = `data/mevtheft_slot-${firstSlot}-to-${lastSlot}.csv`
const outputFile = createWriteStream(fileName)
const write = async s => new Promise(
  resolve => outputFile.write(s) ? resolve() : outputFile.once('drain', resolve)
)
console.log(`Writing to ${fileName}`)
write('slot,max_bid,fees_over_base,mev_reward,proposer_index,proposer_is_rocketpool,correct_fee_recipient\n')

const timestamp = () => Intl.DateTimeFormat('en-GB',
  {hour: 'numeric', minute: 'numeric', second: 'numeric'})
  .format(new Date())

let slotNumber = firstSlot
while (slotNumber <= lastSlot) {
  await write(`${slotNumber},`)
  const {maxBid, numBids} = await getMaxBidForSlot(slotNumber)
  await write(`${maxBid},`)
  console.log(timestamp())
  console.log(`Slot ${slotNumber}: ${numBids} bids`)
  console.log(`Slot ${slotNumber}: Max flashbots bid value: ${ethers.formatEther(maxBid)} ETH`)
  const info = await getSlotInfo(slotNumber)
  if (info.blockNumber === null) {
    console.log(`Slot ${slotNumber}: execution block missing`)
    await write(',,,,\n')
    slotNumber++
    continue
  }
  info.totalBase = info.baseFeePerGas * info.gasUsed
  info.totalPriority = info.feesPaid - info.totalBase
  console.log(`Slot ${slotNumber}: Fees paid over base fee: ${ethers.formatEther(info.totalPriority)} ETH`)
  console.log(`Slot ${slotNumber}: Fees paid as MEV reward: ${ethers.formatEther(info.feeReceived)}`)
  await write(`${info.totalPriority},${info.feeReceived},`)
  console.log(`Slot ${slotNumber}: Proposer index ${info.proposerIndex} (RP: ${info.minipoolAddress != nullAddress})`)
  await write(`${info.proposerIndex},${info.minipoolAddress != nullAddress},`)
  if (info.minipoolAddress != nullAddress) {
    const correctFeeRecipient = await getCorrectFeeRecipient(info.minipoolAddress, info.blockNumber)
    const effectiveFeeRecipient = info.mevFeeRecipient || info.feeRecipient
    console.log(`Slot ${slotNumber}: Correct fee recipient: ${effectiveFeeRecipient == correctFeeRecipient}`)
    await write(`${effectiveFeeRecipient == correctFeeRecipient}\n`)
  }
  else
    await write(`\n`)
  slotNumber++
}
outputFile.end()
