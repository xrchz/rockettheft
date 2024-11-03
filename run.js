#!/usr/bin/env node
import 'dotenv/config'
import { ProxyAgent } from 'undici'
import { ethers } from 'ethers'
import { program } from 'commander'
import { createWriteStream, readFileSync, readdirSync } from 'node:fs'
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
    endSlot: 9690000 // SHOULD BE 9918523 but we failed to collect data before they shut down
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
relayApiUrls.set('Titan Global',
  {
    url: 'https://0x8c4ed5e24fe5c6ae21018437bde147693f68cda427cd1122cf20819c30eda7ed74f72dece09bb313f2a1855595ab677d@global.titanrelay.xyz',
    startSlot: 9079779,
    endSlot: Infinity
  }
)
relayApiUrls.set('Titan Regional',
  {
    url: 'https://0x8c4ed5e24fe5c6ae21018437bde147693f68cda427cd1122cf20819c30eda7ed74f72dece09bb313f2a1855595ab677d@regional.titanrelay.xyz',
    startSlot: 9079779,
    endSlot: Infinity
  }
)

const rocketStorageAddress = '0x1d8f8f00cfa6758d7bE78336684788Fb0ee0Fa46'

const dbDir = process.env.DB_DIR || 'db'
const db = open({path: dbDir})

program.option('-r, --rpc <url>', 'Full node RPC endpoint URL (overrides RPC_URL environment variable, default: http://localhost:8545)')
       .option('-b, --bn <url>', 'Beacon node API endpoint URL (overrides BN_URL environment variable, default: http://localhost:5052)')
       .requiredOption('-s, --slot <num>', 'First slot to process')
       .option('-t, --to-slot <num>', 'Last slot to process (default: --slot)')
       .option('-n, --no-output', 'Do not produce output csv file')
       .option('-p, --proxy <id>', 'Use proxy server')
       .option('-d, --delay <secs>', 'Number of seconds to wait after a 408, 429, 502, or 504 response before retrying', 8)
       .option('-l, --rate-limit <millisecs>', 'Number of milliseconds to pause before fetching from a relay API endpoint', 200)
       .option('-m, --multicall-limit <num>', 'Maximum number of calls to multicall at a time', 1000)

program.parse()
const options = program.opts()

const provider = new ethers.JsonRpcProvider(options.rpc || process.env.RPC_URL || 'http://localhost:8545')
const beaconRpcUrl = options.bn || process.env.BN_URL || 'http://localhost:5052'
const delayms = parseInt(options.delay) * 1000
const rateLimitms = parseInt(options.rateLimit)
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
  let response = await (new Promise(resolve =>
    setTimeout(resolve, rateLimitms)).then(
      () => fetch(url, options).catch(x => {return {status: 599}})))
  while (response.status === 408 || response.status === 429 || response.status === 502 || response.status === 504 || response.status === 599) {
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
       [6209964, 8037005, 8053706, 8054714, 8065991].includes(slotNumber)) ||
      (relayName == 'Ultra Sound' &&
       [8118421].includes(slotNumber))) {
    console.warn(`Special case: assuming no ${relayName} payload for slot ${slotNumber}`)
    return 0
  }
  const path = '/relay/v1/data/bidtraces/proposer_payload_delivered'
  const params = new URLSearchParams({slot: `${slotNumber}`})
  const response = await fetchRelayApi(relayApiUrl, path, params)
  if (response.status !== 200 && response.status !== 204) {
    console.warn(`Unexpected response status getting ${slotNumber} payload from ${relayName}: ${response.status}`)
    console.warn(`URL: ${relayApiUrl} ${path} ${params}`)
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

async function getBids(slotKey, relayName, relayApiUrl) {
  const path = '/relay/v1/data/bidtraces/builder_blocks_received'
  const params = new URLSearchParams({slot: `${slotKey}`})
  const response = await fetchRelayApi(relayApiUrl, path, params)
  if (response.status !== 200 && response.status !== 204) {
    console.warn(`Unexpected response status getting ${slotKey} bids from ${relayName}: ${response.status}`)
    console.warn(`URL: ${relayApiUrl} ${path} ${params}`)
    console.warn(`response text: ${await response.text()}`)
  }
  const payloads = response.status === 204 ? [] : await response.json()
  if (!(payloads instanceof Array)) {
    console.warn(`Unexpected result for ${slotKey} payload: ${payloads}`)
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
      minipoolsByPubkey = db.get(['minipoolsByPubkey']) || new Map()
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
        const fromCount = (db.get(['minipoolsByPubkey']) || {size: 0}).size
        if (fromCount < targetCount) {
          missing.slice(fromCount).forEach(([address, pubkey]) =>
            minipoolsByPubkey.set(pubkey, address))
          db.put(['minipoolsByPubkey'], minipoolsByPubkey)
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
  const key = [blockTag.toString(), nodeAddress, 'avgFee']
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

async function getNodeInfo(minipoolAddress, blockTag) {
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
  const rocketNodeDistributorFactory = new ethers.Contract(
    await getRocketAddress('rocketNodeDistributorFactory', blockTag),
    ['function getProxyAddress(address) view returns (address)'], provider)
  const distributorAddress = await rocketNodeDistributorFactory.getProxyAddress(nodeAddress, {blockTag})
  const avgFee = await getAverageNodeFee(rocketNodeManager, nodeAddress, blockTag).then(n => n.toString())
  return {nodeAddress, inSmoothingPool, distributorAddress, avgFee}
}

async function getEthCollatRatio(nodeAddress, blockTag) {
  const key = [blockTag, nodeAddress, 'ethCollatRatio']
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
<blockNumber>/lastTx {recipient, value}
beaconcha/<slot> {mevReward, mevRewardRelay, feeRecipient}
mevmonitor/<slot> {maxBid, maxBidRelay, mevReward, mevRewardRelay, feeRecipient}
minipoolsByPubkey (map from pubkeys to addresses of minipools)
*/

async function getPriorityFees(blockNumber) {
  const key = [blockNumber.toString(), 'prioFees']
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

async function getLastTxInfo(blockNumber) {
  const key = [blockNumber.toString(), 'lastTx']
  const cached = db.get(key)
  if (typeof cached != 'undefined') return cached
  const block = await provider.getBlock(blockNumber)
  const lastTxHash = block.transactions.at(-1)
  const lastTx = lastTxHash ? await provider.getTransaction(lastTxHash) : {to: '', value: ''}
  const result = {recipient: lastTx.to, value: lastTx.value.toString()}
  await db.put(key, result)
  return result
}

async function populateSlotInfo(slotNumber) {
  const slotKey = slotNumber.toString()
  for (const [relayName, {url: relayApiUrl, startSlot, endSlot}] of relayApiUrls.entries()) {
    if (!(startSlot <= slotNumber && slotNumber <= endSlot)) continue
    const keyPrefix = [slotKey, relayName]
    const maxBidKey = keyPrefix.concat(['maxBid'])
    if (typeof db.get(maxBidKey) == 'undefined') {
      const bids = await getBids(slotKey, relayName, relayApiUrl)
      const maxBid = bids.length ?
        bids.reduce((max, bid) => max > bid ? max : bid, 0n).toString() :
        null
      await db.put(maxBidKey, maxBid)
    }
    const proposedKey = keyPrefix.concat(['proposed'])
    if (typeof db.get(proposedKey) == 'undefined') {
      const payload = await getPayload(slotNumber, relayName, relayApiUrl)
      const result = payload ?
        {mevReward: payload.value.toString(),
         feeRecipient: ethers.getAddress(payload.proposer_fee_recipient)} :
        null
      await db.put(proposedKey, result)
    }
  }
  if (typeof db.get([slotKey]) == 'undefined') {
    const result = {}
    const path = `/eth/v1/beacon/blinded_blocks/${slotKey}`
    const url = new URL(path, beaconRpcUrl)
    const response = await fetch(url)
    if (response.status === 404) {
      await db.put([slotKey], null)
      return
    }
    else if (response.status !== 200) {
      console.warn(`Unexpected response status getting ${slotKey} block: ${response.status}`)
      console.warn(`response text: ${await response.text()}`)
    }
    const json = await response.json()
    if (!('execution_payload_header' in json.data.message.body &&
          parseInt(json.data.message.body.execution_payload_header.block_number))) {
      console.warn(`${slotKey} has no associated post-merge block`)
      await db.put([slotKey], null)
      return
    }
    const blockNumber = parseInt(json.data.message.body.execution_payload_header.block_number)
    const feeRecipient = ethers.getAddress(json.data.message.body.execution_payload_header.fee_recipient)
    const proposerIndex = json.data.message.proposer_index
    const proposerPubkey = await getPubkey(proposerIndex)
    await db.put([slotKey], {blockNumber, proposerIndex, proposerPubkey, feeRecipient})
  }
}

async function getBeaconchaInfoApi(slotKey, blockNumber) {
  const key = ['beaconcha', slotKey]
  const cached = db.get(key)
  if (typeof cached != 'undefined') return cached
  // TODO add delay in case of rate-limiting
  const headers = {
    'Accept': 'application/json',
    'apikey': process.env.BEACONCHA_API_KEY,
  }
  const {status, data} = await fetch(`https://beaconcha.in/api/v1/execution/block/${blockNumber}`, {headers}).then(r => r.json())
  if (status !== 'OK') throw new Error(`Bad status ${status} fetching ${blockNumber} from beaconcha`)
  const bdata = data[0]
  const result = {mevReward: '', mevRewardRelay: '', feeRecipient: ''}
  if (bdata.blockMevReward)
    result.mevReward = bdata.blockMevReward
  if (bdata.relay) {
    const {tag, producerFeeRecipient} = bdata.relay
    result.mevRewardRelay = tag
    result.feeRecipient = producerFeeRecipient
  }
  await db.put(key, result)
  return result
}

const beaconchaFilename = 'beaconcha/8.000-8.003k.txt'
const beaconchaFileLines = readFileSync(beaconchaFilename, 'utf8').split('\n')
beaconchaFileLines.shift() // titles
beaconchaFileLines.shift() // header border
const beaconchaData = {}
for (const line of beaconchaFileLines) {
  const fields = line.split('|')
  const tag = fields.shift().trim()
  const slot = fields.shift().trim()
  const proposerIndex = fields.shift()
  const feeRecipient = `0${fields.shift().trim().substring(1)}`
  const value = fields.shift().trim()
  beaconchaData[slot] ||= {}
  if (beaconchaData[slot].mevReward) {
    if(value !== beaconchaData[slot].mevReward)
      throw new Error(`Inconsistent mevReward from beaconcha for slot ${slot}: ${value} vs ${beaconchaData[slot].mevReward}`)
  }
  else
    beaconchaData[slot].mevReward = value
  if (beaconchaData[slot].feeRecipient) {
    if(feeRecipient !== beaconchaData[slot].feeRecipient)
      throw new Error(`Inconsistent feeRecipient from beaconcha for slot ${slot}: ${feeRecipient} vs ${beaconchaData[slot].feeRecipient}`)
  }
  else
    beaconchaData[slot].feeRecipient = feeRecipient
  beaconchaData[slot].mevRewardRelays ||= []
  beaconchaData[slot].mevRewardRelays.push(tag)
}

async function getBeaconchaInfo(slotKey, blockNumber) {
  /*
  const key = ['beaconcha', slotKey]
  const cached = db.get(key)
  if (typeof cached != 'undefined') return cached
  */

  const result = beaconchaData[slotKey] || { mevReward: '', feeRecipient: '', mevRewardRelays: [] }
  result.mevRewardRelay = result.mevRewardRelays.join(';')

  /*
  delete result.mevRewardRelays
  await db.put(key, result)
  */
  return result
}

const mevmonitorFiles = readdirSync('mevmonitor').filter(n => n.endsWith('.json')).map(n => {
  const [fromSlotStr, rest] = n.split('-')
  const [toSlotStr] = rest.split('.')
  return {
    fromSlot: parseInt(fromSlotStr),
    toSlot: parseInt(toSlotStr),
    fileName: `mevmonitor/${n}`,
    contents: null
  }
})
let mevmonitorContentsStored = 0
const maxContentsStored = 32

async function getMevMonitorInfo(slotNumber) {
  const key = ['mevmonitor', slotNumber.toString()]
  const cached = db.get(key)
  if (typeof cached != 'undefined') return cached
  // TODO: binary instead of linear search?
  const fileData = mevmonitorFiles.find(({fromSlot, toSlot}) => fromSlot <= slotNumber && slotNumber <= toSlot)
  if (!fileData.contents) {
    if (mevmonitorContentsStored >= maxContentsStored) {
      mevmonitorFiles.find(({contents}) => contents).contents = null
      mevmonitorContentsStored -= 1
    }
    fileData.contents = JSON.parse(readFileSync(fileData.fileName))
    mevmonitorContentsStored += 1
  }
  const {top_bids, delivered_payloads} = fileData.contents[slotNumber]
  let maxBid = 0n
  const maxBidRelays = []
  for (const {relay, value} of top_bids) {
    if (maxBid < BigInt(value)) {
      maxBid = BigInt(value)
      maxBidRelays.splice(0, maxBidRelays.length, relay)
    }
    else if (maxBid == BigInt(value))
      maxBidRelays.push(relay)
  }
  let mevReward
  const rewardRelays = []
  const feeRecipients = []
  for (const {relay, value, proposer_fee_recipient} of delivered_payloads) {
    if (mevReward && mevReward != BigInt(value))
      throw new Error(`Slot ${slotNumber}: Duplicate MEV reward ${value} vs ${mevReward} for ${relay} vs ${rewardRelays}`)
    if (!mevReward) mevReward = BigInt(value)
    rewardRelays.push(relay)
    feeRecipients.push(proposer_fee_recipient)
  }
  const result = {
    maxBid: '', maxBidRelay: '', mevReward: '', mevRewardRelay: '', feeRecipient: ''
  }
  if (maxBid) {
    result.maxBid = maxBid.toString()
    result.maxBidRelay = maxBidRelays.join(';')
  }
  if (mevReward) {
    result.mevReward = mevReward.toString()
    result.mevRewardRelay = rewardRelays.join(';')
    result.feeRecipient = feeRecipients.join(';')
  }
  await db.put(key, result)
  return result
}

const timestamp = () => Intl.DateTimeFormat('en-GB',
  {hour: 'numeric', minute: 'numeric', second: 'numeric'})
  .format(new Date())

const firstSlot = parseInt(options.slot)
const lastSlot = options.toSlot ? parseInt(options.toSlot) : firstSlot
if (lastSlot < firstSlot) throw new Error(`invalid slot range: ${firstSlot}-${lastSlot}`)
let slotNumber = firstSlot

/*
// const blockTag = 15835292
// const blockTag = 16828429
const blockTag = 17814442
// const blockTag = 16037791
// const blockTag = atlasDeployBlock - 21600
// const blockTag = atlasDeployBlock + 21600
const rocketNodeManager = new ethers.Contract(
  await getRocketAddress('rocketNodeManager', blockTag),
  ['function getSmoothingPoolRegistrationState(address) view returns (bool)',
   'function getFeeDistributorInitialised(address) view returns (bool)',
   'function getAverageNodeFee(address) view returns (uint256)',
   'function getNodeCount() view returns (uint256)',
   'function getNodeAt(uint256) view returns (address)'
  ], provider)
const nodeCount = await rocketNodeManager.getNodeCount({blockTag})
for (const index of Array(parseInt(nodeCount)).keys()) {
  const nodeAddress = await rocketNodeManager.getNodeAt(index, {blockTag})
  await testGetAverageNodeFee(nodeAddress, blockTag)
}
process.exit()
*/

const fileName = `data/rt2_slot-${firstSlot}-to-${lastSlot}.csv`
const outputFile = options.output ? createWriteStream(fileName) : null
const write = options.output ? async s => new Promise(
  resolve => outputFile.write(s) ? resolve() : outputFile.once('drain', resolve)
) : s => null
const endOut = options.output ? () => new Promise(resolve => outputFile.end(resolve)) : () => null
if (options.output) console.log(`Writing to ${fileName}`)
await write('slot,proposer_index,raw_fee_recipient,last_tx_recipient,last_tx_value,priority_fees,')
await write('is_rocketpool,node_address,distributor_address,in_smoothing_pool,avg_fee,eth_collat_ratio,')
await write('max_bid,max_bid_relay,mev_reward,mev_reward_relay,relay_fee_recipient,')
await write('beaconcha_mev_reward,beaconcha_mev_reward_relay,beaconcha_fee_recipient,')
await write('mevmonitor_max_bid,mevmonitor_max_bid_relay,mevmonitor_mev_reward,mevmonitor_mev_reward_relay,mevmonitor_fee_recipient\n')

/*
Desired data columns:
# Basic slot and block info
slot,                        # slot number
proposer_index,              # proposer index [this and the rest empty for missed blocks]
raw_fee_recipient,           # fee recipient specified for the block
last_tx_recipient,           # target of the last transaction in the block [empty if there are no transactions]
last_tx_value,               # amount of ETH sent in the last transaction in the block [ditto]
priority_fees,               # total ETH paid as transaction fees above the base fee in the block [only included when is_rocketpool and no max_bid]
# Basic RP info
is_rocketpool,               # whether the proposer was a Rocket Pool validator
node_address,                # Rocket Pool node that owns the proposer's validator [this and the rest empty for non-RP]
distributor_address,         # Rocket Pool node fee distributor address for the node
in_smoothing_pool,           # Whether the Rocket Pool node was in the smoothing pool (at this block)
avg_fee,                     # Rocket Pool average fee for the node (at this block)
eth_collat_ratio,            # Rocket Pool ETH collateralisation ratio for the node (at this block)
# Info we queried directly from the RP relays
max_bid,                     # top bid received by RP relays for this slot [this and the rest empty if no bids]
max_bid_relay,               # relays that received the top bid [;-separated]
mev_reward,                  # MEV reward claimed delivered by any RP relay [this and the rest empty if none claimed delivered]
mev_reward_relay,            # RP relays that claim to have delivered the MEV reward [;-separated]
relay_fee_recipient,         # Fee recipient according to the RP relay(s)
# Info we get about relays from Butta
beaconcha_mev_reward,        # MEV reward claimed delivered by Beaconcha [this and the rest empty if none]
beaconcha_mev_reward_relay,  # Relays claimed delivered by Beaconcha [;-separated]
beaconcha_fee_recipient,     # MEV fee recipient according to Beaconcha
# Info we get about relays from Yokem
mevmonitor_max_bid,          # top bid received by any relays for this slot [this and the rest empty if no bids]
mevmonitor_max_bid_relay,    # relays that received the top bid [;-separated]
mevmonitor_mev_reward,       # MEV reward claimed delivered by any relay according to MevMonitor [this and the rest empty if none]
mevmonitor_mev_reward_relay, # Relays claiming to deliver according to MevMonitor [;-separated]
mevmonitor_fee_recipient     # Fee recipient addresses for deliveries above according to MevMonitor [;-separated]
*/

/*
Plan for how to get each item:
slot,                        # given: just iterate through them
proposer_index,              # our db: <slot>['proposerIndex']
raw_fee_recipient,           # our db: <slot>['feeRecipient']
last_tx_recipient,           # our db: <blockNumber>/lastTx['recipient'] *TO COLLECT: read block txs from JSON-RPC*
last_tx_value,               # our db: <blockNumber>/lastTx['value'] *TO COLLECT: as above*
priority_fees,               # our db: <blockNumber>/prioFees
# Basic RP info
is_rocketpool,               # fetch from rpc: see isRocketpool definition [TODO: should we cache all these too?]
node_address,                # fetch from rpc: see getCorrectFeeRecipientAndNodeFee
distributor_address,         # fetch from rpc: ditto
in_smoothing_pool,           # fetch from rpc: ditto
avg_fee,                     # fetch from rpc: ditto
eth_collat_ratio,            # our db: <blockNumber>/<nodeAddress>/ethCollatRatio
# Info we queried directly from the RP relays
max_bid,                     # same as in existing code
max_bid_relay,               # ditto
mev_reward,                  # ditto
mev_reward_relay,            # ditto
relay_fee_recipient,         # ditto
# Info we get about relays from Butta *TO COLLECT: fetch beaconcha and use jsdom to scrape?*
beaconcha_mev_reward,        # our db: beaconcha/<slot>['mevReward']
beaconcha_mev_reward_relay,  # our db: beaconcha/<slot>['mevRewardRelay'] (stored ;-separated)
beaconcha_fee_recipient,     # our db: beaconcha/<slot>['feeRecipient']
# Info we get about relays from Yokem *TO COLLECT: fetch from https://beta-data.mevmonitor.org/*
                             #         read json from filesystem - download and decompress as needed
mevmonitor_max_bid,          # our db: mevmonitor/<slot>['maxBid']
mevmonitor_max_bid_relay,    # our db: mevmonitor/<slot>['maxBidRelay'] (stored ;-separated)
mevmonitor_mev_reward,       # our db: mevmonitor/<slot>['mevReward']
mevmonitor_mev_reward_relay, # our db: mevmonitor/<slot>['mevRewardRelay'] (stored ;-separated)
mevmonitor_fee_recipient     # our db: mevmonitor/<slot>['feeRecipient'] (stored ;-separated)
*/

while (slotNumber <= lastSlot) {
  console.log(`${timestamp()}: Ensuring cache for ${slotNumber}`)

  await populateSlotInfo(slotNumber)
  const slotKey = slotNumber.toString()
  await write(`${slotKey},`)
  console.log(timestamp())

  const {blockNumber, proposerIndex, proposerPubkey, feeRecipient} = db.get([slotKey]) || {}
  if (typeof blockNumber == 'undefined') {
    console.log(`Slot ${slotKey}: Execution block missing`)
    await write('\n'.padStart(24, ','))
    slotNumber++
    continue
  }
  const {recipient: lastTxRecipient, value: lastTxValue} = await getLastTxInfo(blockNumber)
  const priorityFees = await getPriorityFees(blockNumber)
  await write(`${proposerIndex},${feeRecipient},${lastTxRecipient},${lastTxValue},${priorityFees},`)

  const minipoolAddress = await getMinipoolByPubkey(proposerPubkey, blockNumber)
  const isRocketpool = minipoolAddress != nullAddress && await isMinipoolStaking(minipoolAddress, blockNumber)
  await write(`${isRocketpool},`)
  if (isRocketpool) {
    const {nodeAddress, inSmoothingPool, distributorAddress, avgFee} = await getNodeInfo(minipoolAddress, blockNumber)
    const ethCollatRatio = await getEthCollatRatio(nodeAddress, blockNumber)
    await write(`${nodeAddress},${distributorAddress},${inSmoothingPool},${avgFee},${ethCollatRatio},`)
  }
  else {
    await write(',,,,,')
  }

  let maxBid = ''
  const maxBidRelays = []
  for (const relayName of relayApiUrls.keys()) {
    const relayBid = db.get([slotKey, relayName, 'maxBid']) || ''
    if (BigInt(relayBid) > BigInt(maxBid)) {
      maxBid = relayBid
      maxBidRelays.splice(0, maxBidRelays.length, relayName)
    }
    else if (BigInt(relayBid) === BigInt(maxBid)) {
      maxBidRelays.push(relayName)
    }
  }
  await write(`${maxBid},${maxBidRelays.join(';')},`)
  console.log(`Slot ${slotKey}: Max bid ${ethers.formatEther(maxBid || '0')} ETH from ${maxBidRelays.length ? maxBidRelays.join('; ') : '(none)'}`)
  let [mevReward, mevFeeRecipient] = ['', '']
  const mevRewardRelays = []
  for (const relayName of relayApiUrls.keys()) {
    const {mevReward: relayMevReward, feeRecipient: relayFeeRecipient} = db.get([slotKey, relayName, 'proposed']) || {}
    if (relayFeeRecipient || relayMevReward) {
      if ((mevReward || mevFeeRecipient || mevRewardRelays.length) &&
          (mevReward != relayMevReward || mevFeeRecipient != relayFeeRecipient)) {
        console.error(`Slot ${slotKey}: Duplicate MEV reward ${mevRewardRelay} for ${
          ethers.formatEther(mevReward || '0')} via ${mevFeeRecipient} vs ${relayName} for ${
          ethers.formatEther(relayMevReward || '0')} via ${relayFeeRecipient}`)
        await endOut()
        process.exit(1)
      }
      else {
        [mevReward, mevFeeRecipient] = [relayMevReward, relayFeeRecipient]
      }
      mevRewardRelays.push(relayName)
    }
  }
  await write(`${mevReward},${mevRewardRelays.join(';')},${mevFeeRecipient},`)
  console.log(`Slot ${slotKey}: MEV reward ${ethers.formatEther(mevReward || '0')} ETH from ${
    mevRewardRelays.length ? mevRewardRelays.join('; ').concat(` via ${mevFeeRecipient}`) : '(none)'}`)
  console.log(`Slot ${slotKey}: Proposer ${proposerIndex.toString().padStart(7)} ${proposerPubkey} (${isRocketpool ? 'RP' : 'not RP'})`)

  const {mevReward: bcReward, mevRewardRelay: bcRelays, feeRecipient: bcFeeRecipient } = await getBeaconchaInfo(slotKey, blockNumber)
  await write(`${bcReward},${bcRelays},${bcFeeRecipient},`)

  // mevmonitor
  const {maxBid: mmBid, maxBidRelay: mmBidRelays, mevReward: mmReward, mevRewardRelay: mmRelays, feeRecipient: mmFeeRecipient} = await getMevMonitorInfo(slotNumber)
  await write(`${mmBid},${mmBidRelays},${mmReward},${mmRelays},${mmFeeRecipient}\n`)

  slotNumber++
}
await endOut()
await db.close()
