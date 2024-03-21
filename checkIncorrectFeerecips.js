import 'dotenv/config'
import { open } from 'lmdb'
import { readFileSync, writeFileSync } from 'node:fs'
const dbDir = process.env.DB_DIR || 'db'
const db = open({path: dbDir})
const incorrectCsv = readFileSync('/home/ramana/Downloads/IncorrectFeeRecipientSlots.csv', 'utf8')
const relayNames = ['Flashbots','bloXroute Max Profit','bloXroute Ethical','bloXroute Regulated','Blocknative','Eden Network','Ultra Sound','Aestus']
const rETHTokenAddr = '0xae78736Cd615f374D3085123A210448E74Fc6393'.toLowerCase()
let rETHCount = 0
const data = []
for (const line of incorrectCsv.split('\n').slice(1, -1)) {
  const [slot, proposer_index, node_address_x, ] = line.split(';')
  const node_address = node_address_x.trimEnd()
  console.log(`Checking slot '${slot}' proposer '${proposer_index}' node '${node_address}'`)
  const {proposerIndex, feeRecipient} = db.get(`${slot}`) || {}
  if (proposerIndex != proposer_index) throw new Error(`Proposer mismatch on ${slot}: ${proposer_index} vs ${proposerIndex}`)
  const mevFeeRecips = []
  for (const relayName of relayNames) {
    const {mevReward, feeRecipient} = db.get(`${slot}/${relayName}/proposed`) || {}
    if (feeRecipient) {
      console.log(`Got MEV fee recipient ${feeRecipient} from ${relayName}`)
      mevFeeRecips.push({relayName, feeRecipient})
    }
  }
  console.log(`Got normal fee recipient ${feeRecipient}`)
  if (feeRecipient.toLowerCase() == rETHTokenAddr || mevFeeRecips.some(x => x.feeRecipient.toLowerCase() == rETHTokenAddr)) rETHCount++
  data.push({slot, proposer_index, node_address, mev_fee_recipients: mevFeeRecips, fee_recipient: feeRecipient})
}
console.log(`rETH token used ${rETHCount} times`)
const dataLines = ['slot,proposer_index,node_address,mev_fee_recipients,fee_recipient']
for (const {slot, proposer_index, node_address, mev_fee_recipients, fee_recipient} of data)
  dataLines.push([slot, proposer_index, node_address, mev_fee_recipients.map(x => `${x.relayName}:${x.feeRecipient}`).join(';'), fee_recipient].join(','))
writeFileSync('/home/ramana/Downloads/IncorrectFeeRecipientSlotsWithAddresses.csv', dataLines.join('\n'))
