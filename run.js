#!/usr/bin/env node
import 'dotenv/config'
import { ProxyAgent } from 'undici'
import { ethers } from 'ethers'
import { program } from 'commander'
import { createWriteStream } from 'node:fs'
import { open } from 'lmdb'

const relayApiUrls = new Map()
relayApiUrls.set('Flashbots',
  {
    url: 'https://0xac6e77dfe25ecd6110b8e780608cce0dab71fdd5ebea22a16c0205200f2f8e2e3ad3b71d3499c54ad14d6c21b41a37ae@boost-relay.flashbots.net',
    startSlot: 0,
    endSlot: Infinity
  })
relayApiUrls.set('bloXroute Max Profit',
  {
    url: 'https://0x8b5d2e73e2a3a55c6c87b8b6eb92e0149a125c852751db1422fa951e42a09b82c142c3ea98d0d9930b056a3bc9896b8f@bloxroute.max-profit.blxrbdn.com',
    startSlot: 0,
    endSlot: Infinity
  })
// relayApiUrls.set('bloXroute Ethical',
//   'https://0xad0a8bb54565c2211cee576363f3a347089d2f07cf72679d16911d740262694cadb62d7fd7483f27afd714ca0f1b9118@bloxroute.ethical.blxrbdn.com')
relayApiUrls.set('bloXroute Regulated',
  {
    url: 'https://0xb0b07cd0abef743db4260b0ed50619cf6ad4d82064cb4fbec9d3ec530f7c5e6793d9f286c4e082c0244ffb9f2658fe88@bloxroute.regulated.blxrbdn.com',
    startSlot: 0,
    endSlot: Infinity
  })
relayApiUrls.set('Blocknative',
  {
    url: 'https://0x9000009807ed12c1f08bf4e81c6da3ba8e3fc3d953898ce0102433094e5f22f21102ec057841fcb81978ed1ea0fa8246@builder-relay-mainnet.blocknative.com',
    startSlot: 0,
    endSlot: 7459420
  })
relayApiUrls.set('Eden Network',
  {
    url: 'https://0xb3ee7afcf27f1f1259ac1787876318c6584ee353097a50ed84f51a1f21a323b3736f271a895c7ce918c038e4265918be@relay.edennetwork.io',
    startSlot: 0,
    endSlot: Infinity
  })
relayApiUrls.set('Ultra Sound',
  {
    url: 'https://0xa1559ace749633b997cb3fdacffb890aeebdb0f5a3b6aaa7eeeaf1a38af0a8fe88b9e4b1f61f236d2e64d95733327a62@relay.ultrasound.money',
    startSlot: 0,
    endSlot: Infinity
  })
relayApiUrls.set('Aestus',
  {
    url: 'https://0xa15b52576bcbf1072f4a011c0f99f9fb6c66f3e1ff321f11f461d15e31b1cb359caa092c71bbded0bae5b5ea401aab7e@aestus.live',
    startSlot: 0,
    endSlot: Infinity
  })

const rocketStorageAddress = '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46'

const dbDir = process.env.DB_DIR || 'db'
const db = open({path: dbDir})

program.option('-r, --rpc <url>', 'Full node RPC endpoint URL (overrides RPC_URL environment variable, default: http://localhost:8545)')
       .option('-b, --bn <url>', 'Beacon node API endpoint URL (overrides BN_URL environment variable, default: http://localhost:5052)')
       .requiredOption('-s, --slot <num>', 'First slot to process')
       .option('-t, --to-slot <num>', 'Last slot to process (default: --slot)')
       .option('-n, --no-output', 'Do not produce output csv file')
       .option('-p, --proxy <id>', 'Use proxy server')
       .option('-d, --delay <secs>', 'Number of seconds to wait after a 429 or 502 response before retrying', 8)
       .option('-m, --multicall-limit <num>', 'Maximum number of calls to multicall at a time', 1000)

program.parse()
const options = program.opts()

const provider = new ethers.JsonRpcProvider(options.rpc || process.env.RPC_URL || 'http://localhost:8545')
const beaconRpcUrl = options.bn || process.env.BN_URL || 'http://localhost:5052'
const delayms = parseInt(options.delay) * 1000
const multicallLimit = parseInt(options.multicallLimit)

const proxyid = `PROXY${options.proxy}`
const proxy = options.proxy && new ProxyAgent({
  uri: process.env[`${proxyid}_URL`],
  token: `Basic ${Buffer.from(process.env[proxyid.concat('_CREDS')]).toString('base64')}`
})

const multicall = new ethers.Contract('0xeefBa1e63905eF1D7ACbA5a8513c70307C1cE441',
  ['function aggregate((address, bytes)[]) view returns (uint256, bytes[])'], provider)

async function fetchRelayApi(relayApiUrl, path, params) {
  const url = new URL(path.concat('?', params.toString()), relayApiUrl)
  const username = url.username
  url.username = ''
  const options = {
    credentials: 'include',
    headers: {Authorization: `Basic ${Buffer.from(username.concat(':')).toString('base64')}`}
  }
  if (proxy) options.dispatcher = proxy
  let response = await fetch(url, options)
  while (response.status === 429 || response.status === 502) {
    console.warn(`${timestamp()}: Repeating ${url} with ${delayms}ms delay after ${response.status}`)
    response = await (new Promise(resolve =>
      setTimeout(resolve, delayms))).then(
        () => fetch(url, options))
  }
  return response
}

async function getPayload(slotNumber, relayName, relayApiUrl) {
  if ((relayName == 'bloXroute Max Profit' &&
       [6209620, 6209628, 6209637, 6209654, 6209657, 6209661, 6209675, 6209814, 6209827, 6209867, 6209871].includes(slotNumber)) ||
      (relayName == 'bloXroute Regulated' &&
       slotNumber == 6209964)) {
    console.warn(`Special case: assuming no ${relayName} payload for slot ${slotNumber}`)
    return 0
  }
  const path = '/relay/v1/data/bidtraces/proposer_payload_delivered'
  const params = new URLSearchParams({slot: `${slotNumber}`})
  const response = await fetchRelayApi(relayApiUrl, path, params)
  if (response.status !== 200 && response.status !== 204) {
    console.warn(`Unexpected response status getting ${slotNumber} payload from ${relayName}: ${response.status}`)
    console.warn(`response text: ${await response.text()}`)
  }
  const payloads = response.status === 204 ? [] : await response.json()
  if (payloads instanceof Array) {
    while (payloads.length > 1 &&
           payloads[0].value === payloads[1].value &&
           payloads[0].proposer_fee_recipient === payloads[1].proposer_fee_recipient)
      payloads.shift()
  }
  if (relayName == 'bloXroute Max Profit' && slotNumber == 6209957 &&
      payloads.length == 2 && payloads[0].value == '131339047791255559') {
    console.warn(`Special case: discarding extra ${relayName} payloads for slot ${slotNumber}`)
    payloads.pop()
  }
  if (!(payloads instanceof Array && payloads.length <= 1)) {
    console.warn(`Unexpected result for ${slotNumber} payload from ${relayName}: ${JSON.stringify(payloads)}`)
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
  return payloads.map(x => BigInt(x.value))
}

const nullAddress = '0x0000000000000000000000000000000000000000'
const rocketStorage = new ethers.Contract(rocketStorageAddress,
  ['function getAddress(bytes32) view returns (address)'], provider)
const getRocketAddress = (name, blockTag) => rocketStorage['getAddress(bytes32)'](ethers.id(`contract.address${name}`), {blockTag})

const atlasVersion = 4
const atlasDeployBlock = 17069898

let minipoolsLastBlock = 0
let minipoolsByPubkey

async function populateMinipoolsByPubkey(blockTag) {
  if (minipoolsLastBlock < blockTag) {
    const rocketMinipoolManager = new ethers.Contract(
      await getRocketAddress('rocketMinipoolManager', blockTag),
      [// 'function getMinipoolByPubkey(bytes) view returns (address)', We can't just use this because it's broken (as of Atlas), in particular for minipools that started vacant
        'function getMinipoolPubkey(address) view returns (bytes)',
        'function getMinipoolCount() view returns (uint256)',
        'function getMinipoolAt(uint256) view returns (address)'], provider)
    const getMinipoolAt = rocketMinipoolManager.interface.getFunction('getMinipoolAt')
    const getMinipoolPubkey = rocketMinipoolManager.interface.getFunction('getMinipoolPubkey')
    const minipoolCount = (minipoolsByPubkey || 0) && minipoolsByPubkey.size
    const targetCount = parseInt(await rocketMinipoolManager.getMinipoolCount({blockTag}))
    if (minipoolCount < targetCount) {
      minipoolsByPubkey = db.get('minipoolsByPubkey') || new Map()
      const missing = Array(targetCount)
      let index = minipoolsByPubkey.size
      while (index < targetCount) {
        const toAdd = Math.min(targetCount - index, multicallLimit)
        const addressCalls = Array.from(Array(toAdd).keys()).map(i => [
          rocketMinipoolManager,
          rocketMinipoolManager.interface.encodeFunctionData(getMinipoolAt, [index + i])
        ])
        const [addressResultsBlock, addressResults] = await multicall.aggregate(addressCalls, {blockTag})
        if (parseInt(addressResultsBlock) != blockTag || addressCalls.length != addressResults.length) {
          console.error(`Unexpected multicall result ${addressResultsBlock}, ${addressResults.length} (wanted ${blockTag}, ${addressCalls.lengtH})`)
          process.exit(1)
        }
        const addresses = addressResults.map(r => rocketMinipoolManager.interface.decodeFunctionResult(getMinipoolAt, r)[0])
        const pubkeyCalls = addresses.map(address => [
          rocketMinipoolManager,
          rocketMinipoolManager.interface.encodeFunctionData(
            getMinipoolPubkey, [address])
        ])
        const [pubkeyResultsBlock, pubkeyResults] = await multicall.aggregate(pubkeyCalls, {blockTag})
        if (parseInt(pubkeyResultsBlock) != blockTag || pubkeyCalls.length != pubkeyResults.length) {
          console.error(`Unexpected multicall result ${pubkeyResultsBlock}, ${pubkeyResults.length} (wanted ${blockTag}, ${pubkeyCalls.length})`)
          process.exit(1)
        }
        missing.splice(index, pubkeyResults.length, ...pubkeyResults.map((r, i) => [
          addresses[i],
          rocketMinipoolManager.interface.decodeFunctionResult(getMinipoolPubkey, r)[0]
        ]))
        index += toAdd
      }
      await db.transaction(() => {
        const fromCount = (db.get('minipoolsByPubkey') || {size: 0}).size
        if (fromCount < targetCount) {
          missing.slice(fromCount).forEach(([address, pubkey]) =>
            minipoolsByPubkey.set(pubkey, address))
          db.put('minipoolsByPubkey', minipoolsByPubkey)
        }
      })
    }
    minipoolsLastBlock = blockTag
  }
}

async function getMinipoolByPubkey(pubkey, blockTag) {
  await populateMinipoolsByPubkey(blockTag)
  if (minipoolsByPubkey && minipoolsByPubkey.has(pubkey))
    return minipoolsByPubkey.get(pubkey)
  else
    return nullAddress
}

async function getPubkey(index) {
  const path = `/eth/v1/beacon/states/finalized/validators/${index}`
  const url = new URL(path, beaconRpcUrl)
  const response = await fetch(url)
  if (response.status !== 200) {
    console.warn(`Unexpected response status getting ${index} pubkey: ${response.status}`)
    console.warn(`response text: ${await response.text()}`)
  }
  const json = await response.json()
  return json.data.validator.pubkey
}

const stakingStatus = 2
const oneEther = ethers.parseEther('1')
const launchBalance = ethers.parseEther('32')
const emptyStorage = '0x0000000000000000000000000000000000000000000000000000000000000000'

function isMinipoolStaking(minipoolAddress, blockTag) {
  const minipool = new ethers.Contract(minipoolAddress,
    ['function getStatus() view returns (uint8)',
     'function getFinalised() view returns (bool)'], provider)
  return provider.getStorage(minipool, 0, blockTag).then(s =>
    s != emptyStorage &&
    minipool.getStatus({blockTag}).then(status =>
      status == stakingStatus &&
      minipool.getFinalised({blockTag}).then(finalised =>
        !finalised
      )
    )
  )
}

function groupBy2(a) {
  const result = []
  while (a.length)
    result.push([a.shift(), a.shift()])
  return result
}

async function getAverageNodeFeeWorkaround(nodeAddress, blockTag) {
  const rocketMinipoolManager = new ethers.Contract(
    await getRocketAddress('rocketMinipoolManager', blockTag),
    ['function getNodeMinipoolCount(address) view returns (uint256)',
     'function getNodeMinipoolAt(address, uint256) view returns (address)',
    ], provider)
  const minipoolCount = await rocketMinipoolManager.getNodeMinipoolCount(nodeAddress, {blockTag})
  let depositWeightTotal = 0n
  const feesByWeight = new Map()
  const getNodeMinipoolAt = rocketMinipoolManager.interface.getFunction('getNodeMinipoolAt')
  const minipoolInterface = new ethers.Interface([
    'function getNodeDepositBalance() view returns (uint256)',
    'function getStatus() view returns (uint8)',
    'function getFinalised() view returns (bool)',
    'function getNodeFee() view returns (uint256)'
  ])
  const getStatus = minipoolInterface.getFunction('getStatus')
  const getFinalised = minipoolInterface.getFunction('getFinalised')
  const getNodeDepositBalance = minipoolInterface.getFunction('getNodeDepositBalance')
  const getNodeFee = minipoolInterface.getFunction('getNodeFee')
  const minipoolIndices = Array.from(Array(parseInt(minipoolCount)).keys())
  while (minipoolIndices.length) {
    const indicesToProcess = minipoolIndices.splice(0, multicallLimit)
    const minipoolAddresses = await multicall
      .aggregate(
        indicesToProcess.map(i =>
          [rocketMinipoolManager,
           rocketMinipoolManager.interface.encodeFunctionData(getNodeMinipoolAt, [nodeAddress, i])]),
        {blockTag})
      .then(([, results]) =>
        Array.from(results).map(r =>
          rocketMinipoolManager.interface.decodeFunctionResult(getNodeMinipoolAt, r)[0]))
      .then(result => Array.from(result))
    const stakingAddresses = await multicall
      .aggregate(
        minipoolAddresses.flatMap(m =>
          [[m, minipoolInterface.encodeFunctionData(getStatus, [])],
           [m, minipoolInterface.encodeFunctionData(getFinalised, [])]]),
        {blockTag})
      .then(([_, statuses]) =>
        groupBy2(Array.from(statuses))
        .flatMap(([s, f], i) =>
          minipoolInterface.decodeFunctionResult(getStatus, s)[0] == stakingStatus &&
          !(minipoolInterface.decodeFunctionResult(getFinalised, f)[0])
          ? [minipoolAddresses[i]] : []))
      .then(result => Array.from(result))
    const minipoolCalls = stakingAddresses
      .flatMap(m => [[m, minipoolInterface.encodeFunctionData(getNodeDepositBalance, [])],
                     [m, minipoolInterface.encodeFunctionData(getNodeFee, [])]])
    const [, result] = await multicall.aggregate(minipoolCalls, {blockTag})
    const nodeDepositsAndFees = Array.from(result)
    while (nodeDepositsAndFees.length) {
      const nodeDeposit = minipoolInterface.decodeFunctionResult(getNodeDepositBalance, nodeDepositsAndFees.shift())[0]
      const nodeFee = minipoolInterface.decodeFunctionResult(getNodeFee, nodeDepositsAndFees.shift())[0]
      const depositWeight = launchBalance - nodeDeposit
      depositWeightTotal += depositWeight
      if (!feesByWeight.has(depositWeight)) feesByWeight.set(depositWeight, nodeFee)
      else feesByWeight.set(depositWeight, feesByWeight.get(depositWeight) + nodeFee)
    }
  }
  let averageNodeFee = 0n
  for (const [depositWeight, fees] of feesByWeight.entries()) {
    const scaledWeight = (depositWeight /* * count */ * oneEther) / depositWeightTotal
    averageNodeFee += (fees * scaledWeight) /* / count */
  }
  return averageNodeFee / oneEther
}

async function getAverageNodeFee(rocketNodeManager, nodeAddress, blockTag) {
  const key = `${blockTag}/${nodeAddress}/avgFee`
  const cached = db.get(key)
  if (typeof cached != 'undefined') return cached
  if (await rocketNodeManager.getFeeDistributorInitialised(nodeAddress, {blockTag})) {
    const result = await rocketNodeManager.getAverageNodeFee(nodeAddress, {blockTag})
    await db.put(key, result)
    return result
  }
  const result = await getAverageNodeFeeWorkaround(nodeAddress, blockTag)
  await db.put(key, result)
  return result
}

async function getCorrectFeeRecipientAndNodeFee(minipoolAddress, blockTag) {
  const minipool = new ethers.Contract(
    minipoolAddress,
    ['function getNodeAddress() view returns (address)'], provider)
  const nodeAddress = await minipool.getNodeAddress()
  const rocketNodeManager = new ethers.Contract(
    await getRocketAddress('rocketNodeManager', blockTag),
    ['function getSmoothingPoolRegistrationState(address) view returns (bool)',
     'function getFeeDistributorInitialised(address) view returns (bool)',
     'function getAverageNodeFee(address) view returns (uint256)'], provider)
  const inSmoothingPool = await rocketNodeManager.getSmoothingPoolRegistrationState(nodeAddress, {blockTag})
  const SPAddress = await getRocketAddress('rocketSmoothingPool', blockTag)
  const rocketNodeDistributorFactory = new ethers.Contract(
    await getRocketAddress('rocketNodeDistributorFactory', blockTag),
    ['function getProxyAddress(address) view returns (address)'], provider)
  const correctFeeRecipient = inSmoothingPool ? SPAddress : await rocketNodeDistributorFactory.getProxyAddress(nodeAddress, {blockTag})
  const avgFee = await getAverageNodeFee(rocketNodeManager, nodeAddress, blockTag).then(n => n.toString())
  return {nodeAddress, inSmoothingPool, correctFeeRecipient, avgFee}
}

async function getEthCollatRatio(nodeAddress, blockTag) {
  const key = `${blockTag}/${nodeAddress}/ethCollatRatio`
  const cached = db.get(key)
  if (typeof cached != 'undefined') return cached
  const rocketNodeStaking = new ethers.Contract(
    await getRocketAddress('rocketNodeStaking', blockTag),
    ['function getNodeETHCollateralisationRatio(address) view returns (uint256)',
     'function version() view returns (uint8)'], provider)
  const result = await rocketNodeStaking.version({blockTag}).then(
    v => parseInt(v) < atlasVersion ? 2n * oneEther :
    rocketNodeStaking.getNodeETHCollateralisationRatio(
      nodeAddress, {blockTag})).then(n => n.toString())
  await db.put(key, result)
  return result
}

/*
keys to cache:
<slot>/<relay>/maxBid (string; null if no bids from this relay)
<slot>/<relay>/proposed {mevReward, feeRecipient} (null if a bid from this relay was not proposed)
<slot> {blockNumber, proposerIndex, proposerPubkey, feeRecipient} (null if this slot was missed)
<blockNumber>/<nodeAddress>/avgFee (string or missing)
<blockNumber>/<nodeAddress>/ethCollatRatio (string or missing)
<blockNumber>/prioFees (string; missing unless this block proposer is rocketpool and no RP relays have bids)
minipoolsByPubkey (map from pubkeys to addresses of minipools)
*/

async function getPriorityFees(blockNumber) {
  const key = `${blockNumber}/prioFees`
  const cached = db.get(key)
  if (typeof cached != 'undefined') return cached
  const block = await provider.getBlock(blockNumber)
  const gasUsed = block.gasUsed
  const baseFeePerGas = block.baseFeePerGas
  let feesPaid = 0n
  for (const hash of block.transactions) {
    const receipt = await provider.getTransactionReceipt(hash)
    feesPaid += receipt.gasUsed * receipt.gasPrice
  }
  const baseFees = gasUsed * baseFeePerGas
  const result = (feesPaid - baseFees).toString()
  await db.put(key, result)
  return result
}

async function populateCache(slotNumber) {
  for (const [relayName, {url: relayApiUrl, startSlot, endSlot}] of relayApiUrls.entries()) {
    if (!(startSlot <= slotNumber && slotNumber <= endSlot)) continue
    const keyPrefix = `${slotNumber}/${relayName}`
    const maxBidKey = `${keyPrefix}/maxBid`
    if (typeof db.get(maxBidKey) == 'undefined') {
      const bids = await getBids(slotNumber, relayName, relayApiUrl)
      const maxBid = bids.length ?
        bids.reduce((max, bid) => max > bid ? max : bid, 0n).toString() :
        null
      await db.put(maxBidKey, maxBid)
    }
    const proposedKey = `${keyPrefix}/proposed`
    if (typeof db.get(proposedKey) == 'undefined') {
      const payload = await getPayload(slotNumber, relayName, relayApiUrl)
      const result = payload ?
        {mevReward: payload.value.toString(),
         feeRecipient: ethers.getAddress(payload.proposer_fee_recipient)} :
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
    const feeRecipient = ethers.getAddress(json.data.message.body.execution_payload_header.fee_recipient)
    const proposerIndex = json.data.message.proposer_index
    const proposerPubkey = await getPubkey(proposerIndex)
    await db.put(`${slotNumber}`, {blockNumber, proposerIndex, proposerPubkey, feeRecipient})
  }
}

const timestamp = () => Intl.DateTimeFormat('en-GB',
  {hour: 'numeric', minute: 'numeric', second: 'numeric'})
  .format(new Date())

const firstSlot = parseInt(options.slot)
const lastSlot = options.toSlot ? parseInt(options.toSlot) : firstSlot
if (lastSlot < firstSlot) throw new Error(`invalid slot range: ${firstSlot}-${lastSlot}`)
let slotNumber = firstSlot

const fileName = `data/rockettheft_slot-${firstSlot}-to-${lastSlot}.csv`
const outputFile = options.output ? createWriteStream(fileName) : null
const write = options.output ? async s => new Promise(
  resolve => outputFile.write(s) ? resolve() : outputFile.once('drain', resolve)
) : s => null
const endOut = options.output ? () => new Promise(resolve => outputFile.end(resolve)) : () => null
if (options.output) console.log(`Writing to ${fileName}`)
await write('slot,max_bid,max_bid_relay,mev_reward,mev_reward_relay,')
await write('proposer_index,is_rocketpool,node_address,in_smoothing_pool,correct_fee_recipient,')
await write('priority_fees,avg_fee,eth_collat_ratio\n')

while (slotNumber <= lastSlot) {
  console.log(`${timestamp()}: Ensuring cache for ${slotNumber}`)
  await populateCache(slotNumber)
  await write(`${slotNumber},`)
  console.log(timestamp())
  const {blockNumber, proposerIndex, proposerPubkey, feeRecipient} = db.get(`${slotNumber}`) || {}
  if (typeof blockNumber == 'undefined') {
    console.log(`Slot ${slotNumber}: Execution block missing`)
    await write(',,,,,,,,,,,\n')
    slotNumber++
    continue
  }
  let [maxBid, maxBidRelay] = ['', '']
  for (const relayName of relayApiUrls.keys()) {
    const relayBid = db.get(`${slotNumber}/${relayName}/maxBid`) || ''
    if (BigInt(relayBid) > BigInt(maxBid))
      [maxBid, maxBidRelay] = [relayBid, relayName]
  }
  await write(`${maxBid},${maxBidRelay},`)
  console.log(`Slot ${slotNumber}: Max bid ${ethers.formatEther(maxBid || '0')} ETH from ${maxBidRelay || '(none)'}`)
  let [mevReward, mevRewardRelay, mevFeeRecipient] = ['', '', '']
  const mevRewardRelays = []
  for (const relayName of relayApiUrls.keys()) {
    const {mevReward: relayMevReward, feeRecipient: relayFeeRecipient} = db.get(`${slotNumber}/${relayName}/proposed`) || {}
    if (relayFeeRecipient || relayMevReward) {
      if ((mevReward || mevRewardRelay || mevFeeRecipient) && mevReward != relayMevReward) {
        console.error(`Slot ${slotNumber}: Duplicate MEV reward ${mevRewardRelay} for ${
          ethers.formatEther(mevReward || '0')} vs ${relayName} for ${
          ethers.formatEther(relayMevReward || '0')}`)
        await endOut()
        process.exit(1)
      }
      [mevReward, mevRewardRelay, mevFeeRecipient] = [relayMevReward, relayName, relayFeeRecipient]
      mevRewardRelays.push(mevRewardRelay)
    }
  }
  await write(`${mevReward},${mevRewardRelays.join(';')},`)
  console.log(`Slot ${slotNumber}: MEV reward ${ethers.formatEther(mevReward || '0')} ETH from ${
    mevRewardRelay ? mevRewardRelay.concat(' via ', mevFeeRecipient) : '(none)'}`)
  const minipoolAddress = await getMinipoolByPubkey(proposerPubkey, blockNumber)
  const isRocketpool = minipoolAddress != nullAddress && await isMinipoolStaking(minipoolAddress, blockNumber)
  await write(`${proposerIndex},${isRocketpool},`)
  console.log(`Slot ${slotNumber}: Proposer ${proposerIndex.toString().padStart(7)} ${proposerPubkey} (${isRocketpool ? 'RP' : 'not RP'})`)
  if (isRocketpool) {
    const {nodeAddress, inSmoothingPool, correctFeeRecipient, avgFee} = await getCorrectFeeRecipientAndNodeFee(minipoolAddress, blockNumber)
    const effectiveFeeRecipient = mevFeeRecipient || feeRecipient
    console.log(`mevFeeRecipient: ${mevFeeRecipient}, feeRecipient: ${feeRecipient}`)
    const hasCorrectFeeRecipient = effectiveFeeRecipient == correctFeeRecipient
    const priorityFees = mevReward ? '' : await getPriorityFees(blockNumber)
    const ethCollatRatio = await getEthCollatRatio(nodeAddress, blockNumber)
    await write(`${nodeAddress},${inSmoothingPool},${hasCorrectFeeRecipient},${priorityFees},${avgFee},${ethCollatRatio}\n`)
    console.log(`Slot ${slotNumber}: Correct fee recipient ${hasCorrectFeeRecipient} (${effectiveFeeRecipient} ${hasCorrectFeeRecipient ? '=' : '≠'} ${correctFeeRecipient})`)
    console.log(`Slot ${slotNumber}: Average fee ${ethers.formatEther(avgFee)}, ETH collat ${ethers.formatEther(ethCollatRatio)}`)
    if (priorityFees) console.log(`Slot ${slotNumber}: Priority fees ${ethers.formatEther(priorityFees)} ETH`)
  }
  else {
    await write(',,,,,\n')
  }
  slotNumber++
}
await endOut()
await db.close()
