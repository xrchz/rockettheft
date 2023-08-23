import 'dotenv/config'
import { ethers } from 'ethers'
import { program } from 'commander'
import { readFileSync, readdirSync, createWriteStream } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { open } from 'lmdb'

const relayApiUrls = new Map()
relayApiUrls.set('Flashbots',
  'https://0xac6e77dfe25ecd6110b8e780608cce0dab71fdd5ebea22a16c0205200f2f8e2e3ad3b71d3499c54ad14d6c21b41a37ae@boost-relay.flashbots.net')
relayApiUrls.set('bloXroute Max Profit',
  'https://0x8b5d2e73e2a3a55c6c87b8b6eb92e0149a125c852751db1422fa951e42a09b82c142c3ea98d0d9930b056a3bc9896b8f@bloxroute.max-profit.blxrbdn.com')
relayApiUrls.set('bloXroute Ethical',
  'https://0xad0a8bb54565c2211cee576363f3a347089d2f07cf72679d16911d740262694cadb62d7fd7483f27afd714ca0f1b9118@bloxroute.ethical.blxrbdn.com')
relayApiUrls.set('bloXroute Regulated',
  'https://0xb0b07cd0abef743db4260b0ed50619cf6ad4d82064cb4fbec9d3ec530f7c5e6793d9f286c4e082c0244ffb9f2658fe88@bloxroute.regulated.blxrbdn.com')
relayApiUrls.set('Blocknative',
  'https://0x9000009807ed12c1f08bf4e81c6da3ba8e3fc3d953898ce0102433094e5f22f21102ec057841fcb81978ed1ea0fa8246@builder-relay-mainnet.blocknative.com')
relayApiUrls.set('Eden Network',
  'https://0xb3ee7afcf27f1f1259ac1787876318c6584ee353097a50ed84f51a1f21a323b3736f271a895c7ce918c038e4265918be@relay.edennetwork.io')
relayApiUrls.set('Ultra Sound',
  'https://0xa1559ace749633b997cb3fdacffb890aeebdb0f5a3b6aaa7eeeaf1a38af0a8fe88b9e4b1f61f236d2e64d95733327a62@relay.ultrasound.money')
relayApiUrls.set('Aestus',
  'https://0xa15b52576bcbf1072f4a011c0f99f9fb6c66f3e1ff321f11f461d15e31b1cb359caa092c71bbded0bae5b5ea401aab7e@aestus.live')

const rocketStorageAddress = '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46'

const dbDir = process.env.DB_DIR || 'db'
const db = open({path: dbDir})

program.option('-r, --rpc <url>', 'Full node RPC endpoint URL (overrides RPC_URL environment variable, default: http://localhost:8545)')
       .option('-b, --bn <url>', 'Beacon node API endpoint URL (overrides BN_URL environment variable, default: http://localhost:5052)')
       .requiredOption('-s, --slot <num>', 'First slot to process')
       .option('-t, --to-slot <num>', 'Last slot to process (default: --slot)')
       .option('-c, --cache-only', 'Just fill the cache, do not output csv')
       .option('-k, --skip-cache', 'Assume the cache is already populated and output csv')

program.parse()
const options = program.opts()

const provider = new ethers.JsonRpcProvider(options.rpc || process.env.RPC_URL || 'http://localhost:8545')
const beaconRpcUrl = options.bn || process.env.BN_URL || 'http://localhost:5052'

function fetchRelayApi(relayApiUrl, path, params) {
  // TODO: rate-limit
  const url = new URL(path.concat('?', params.toString()), relayApiUrl)
  const username = url.username
  url.username = ''
  return fetch(url,
    {credentials: 'include',
     headers: {Authorization: `Basic ${Buffer.from(username.concat(':')).toString('base64')}`}
    })
}

async function getPayload(slotNumber, relayName, relayApiUrl) {
  const path = '/relay/v1/data/bidtraces/proposer_payload_delivered'
  const params = new URLSearchParams({slot: `${slotNumber}`})
  const response = await fetchRelayApi(relayApiUrl, path, params)
  if (response.status !== 200 && response.status !== 204) {
    console.warn(`Unexpected response status getting ${slotNumber} payload from ${relayName}: ${response.status}`)
    console.warn(`response text: ${await response.text()}`)
  }
  const payloads = response.status === 204 ? [] : await response.json()
  if (!(payloads instanceof Array && payloads.length <= 1)) {
    console.warn(`Unexpected result for ${slotNumber} payload: ${payloads}`)
    return {}
  }
  return payloads.length && payloads[0]
}

async function getBids(slotNumber, relayName, relayApiUrl) {
  const path = '/relay/v1/data/bidtraces/builder_blocks_received'
  const params = new URLSearchParams({slot: `${slotNumber}`})
  const response = await fetchRelayApi(relayApiUrl, path, params)
  if (response.status !== 200 && response.status !== 204) {
    console.warn(`Unexpected response status getting ${slotNumber} bids from ${relayName}: ${response.status}`)
    console.warn(`response text: ${await response.text()}`)
  }
  const payloads = response.status === 204 ? [] : await response.json()
  if (!(payloads instanceof Array)) {
    console.warn(`Unexpected result for ${slotNumber} payload: ${payloads}`)
    return []
  }
  return payloads
}

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

/*
keys to cache:
<slot>/<relay>/maxBid (null if no bids from this relay)
<slot>/<relay>/proposed/{mevReward, feeRecipient} (null if a bid from this relay was not proposed)
<slot>/{blockNumber, proposerIndex, feeRecipient, minipoolAddress (nullAddress if not rocketpool)} (null if this slot was missed)
*/

async function populateCache(slotNumber) {
  for (const [relayName, relayApiUrl] of relayApiUrls.entries()) {
    const keyPrefix = `${slotNumber}/${relayName}`
    const maxBidKey = `${keyPrefix}/maxBid`
    if (typeof db.get(maxBidKey) == 'undefined') {
      const bids = await getBids(slotNumber, relayName, relayApiUrl)
      const maxBid = bids.length ?
        bids.reduce((max, bid) => max > bid.value ? max : bid.value, 0n).toString() :
        null
      await db.put(maxBidKey, maxBid)
    }
    const proposedKey = `${keyPrefix}/${relayName}/proposed`
    if (typeof db.get(proposedKey) == 'undefined') {
      const payload = await getPayload(slotNumber, relayName, relayApiUrl)
      const result = payload ?
        {mevReward: payload.value.toString(),
         feeRecipient: payload.proposer_fee_recipient} :
        null
      await db.put(proposedKey, result)
    }
  }
  if (typeof db.get(`${slotNumber}`) == 'undefined') {
    const result = {}
    const path = `/eth/v1/beacon/blinded_blocks/${slotNumber}`
    const url = new URL(path, beaconRpcUrl)
    const response = await fetch(url)
    if (response.status === 404) {
      await db.put(`${slotNumber}`, null)
      return
    }
    else if (response.status !== 200) {
      console.warn(`Unexpected response status getting ${slotNumber} block: ${response.status}`)
      console.warn(`response text: ${await response.text()}`)
    }
    const json = await response.json()
    if (!('execution_payload_header' in json.data.message.body &&
          parseInt(json.data.message.body.execution_payload_header.block_number))) {
      console.warn(`${slotNumber} has no associated post-merge block`)
      await db.put(`${slotNumber}`, null)
      return
    }
    const blockNumber = parseInt(json.data.message.body.execution_payload_header.block_number)
    const blockNumberHex = `0x${blockNumber.toString(16)}`
    const feeRecipient = ethers.getAddress(json.data.message.body.execution_payload_header.fee_recipient)
    const proposerIndex = json.data.message.proposer_index
    const minipoolAddress = await getMinipoolAddress(proposerIndex, blockNumber)
    await db.put(`${slotNumber}`, {blockNumber, proposerIndex, feeRecipient, minipoolAddress})
  }
}

/*
async function getSlotInfo(slotNumber) {
  const txCount = await provider.send('eth_getBlockTransactionCountByNumber',
    [blockNumberHex]).then(r => parseInt(r))
  const lastTx = txCount && await provider.send('eth_getTransactionByBlockNumberAndIndex',
    [blockNumberHex, `0x${(txCount - 1).toString(16)}`])
  const {feeReceived, mevFeeRecipient} = lastTx && ethers.getAddress(lastTx.from) == feeRecipient ?
    {feeReceived: lastTx.value.toString(), mevFeeRecipient: ethers.getAddress(lastTx.to)} :
    {feeReceived: '0', mevFeeRecipient: null}
  const result = {blockNumber, proposerIndex, minipoolAddress, feeRecipient, mevFeeRecipient, feeReceived}
  return result
}
*/

const timestamp = () => Intl.DateTimeFormat('en-GB',
  {hour: 'numeric', minute: 'numeric', second: 'numeric'})
  .format(new Date())

const firstSlot = parseInt(options.slot)
const lastSlot = options.toSlot ? parseInt(options.toSlot) : firstSlot
if (lastSlot < firstSlot) throw new Error(`invalid slot range: ${firstSlot}-${lastSlot}`)

if (!options.skipCache) {
  let slotNumber = firstSlot
  while (slotNumber <= lastSlot) {
    console.log(`${timestamp()} Populating cache for ${slotNumber}`)
    await populateCache(slotNumber++)
  }
}

if (!options.cacheOnly) {
  console.warn('Output csv not yet implemented')
}

process.exit()

// TODO: also store proposer_fee_recipient in processed bid values files
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

const fileName = `data/rt_slot-${firstSlot}-to-${lastSlot}.csv`
const outputFile = createWriteStream(fileName)
const write = async s => new Promise(
  resolve => outputFile.write(s) ? resolve() : outputFile.once('drain', resolve)
)
console.log(`Writing to ${fileName}`)
write('slot,max_bid,mev_reward,proposer_index,proposer_is_rocketpool,correct_fee_recipient\n')

const crossCheckErrors = []
function crossCheck(msg) {
  console.warn(msg)
  crossCheckErrors.push(msg)
}

let slotNumber = firstSlot
while (slotNumber <= lastSlot) {
  await write(`${slotNumber},`)
  const {maxBid, numBids} = await getMaxBidForSlot(slotNumber)
  await write(`${maxBid},`)
  console.log(timestamp())
  console.log(`Slot ${slotNumber}: ${numBids} flashbots bids`)
  console.log(`Slot ${slotNumber}: Max flashbots bid value: ${ethers.formatEther(maxBid)} ETH`)
  const info = await getSlotInfo(slotNumber)
  if (info.blockNumber === null) {
    console.log(`Slot ${slotNumber}: execution block missing`)
    await write(',,,\n')
    slotNumber++
    continue
  }
  console.log(`Slot ${slotNumber}: Fees paid as MEV reward: ${ethers.formatEther(info.feeReceived)}`)
  await write(`${info.feeReceived},`)

  const payload = await getPayload(slotNumber)
  if (info.mevFeeRecipient && !payload)
    console.log(`Slot ${slotNumber}: MEV recipient but no flashbots payload`)
  if (payload && info.mevFeeRecipient != ethers.getAddress(payload.proposer_fee_recipient))
    crossCheck(`Slot ${slotNumber}: Delivered payload to wrong fee recipient ${info.mevFeeRecipient} vs ${payload.proposer_fee_recipient}`)
  if (payload && info.mevFeeRecipient && BigInt(payload.value) != BigInt(info.feeReceived))
    crossCheck(`Slot ${slotNumber}: Flashbots payload value differs from feeReceived: ${payload.value} vs ${info.feeReceived}`)

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
  while (crossCheckErrors.length)
    await write(crossCheckErrors.shift().concat('\n'))
  slotNumber++
}
outputFile.end()
