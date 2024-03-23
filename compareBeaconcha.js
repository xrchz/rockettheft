import 'dotenv/config'
import { JSDOM } from 'jsdom'
import { open } from 'lmdb'
import { readFileSync, writeFileSync } from 'node:fs'
const dbDir = process.env.DB_DIR || 'db'
const db = open({path: dbDir})
const relayNames = ['Flashbots','bloXroute Max Profit','bloXroute Ethical','bloXroute Regulated','Blocknative','Eden Network','Ultra Sound','Aestus']
const incorrectCsv = readFileSync('/home/ramana/Downloads/IncorrectFeeRecipientSlots.csv', 'utf8')
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
      mevFeeRecips.push({
        relayName: relayName.toLowerCase(),
        mevReward,
        feeRecipient: feeRecipient.toLowerCase()
      })
    }
  }
  console.log(`Got normal fee recipient ${feeRecipient}`)
  await new Promise(resolve => setTimeout(resolve, 1000))
  const beaconcha = await fetch(`https://beaconcha.in/slot/${slot}`).then(r => r.text()).then(t => new JSDOM(t).window.document)
  const beaconchaRelays = Array.from(beaconcha.querySelectorAll('div.tags > a')).map(
    a => a.title.slice('Block proposed using the '.length, -(' Relay').length)
  ).map(n => n.toLowerCase().replaceAll('-', ' '))
  console.log(`Got ${beaconchaRelays.length} beaconcha relays: ${beaconchaRelays}`)
  const beaconchaMEVFeeRecipient = beaconcha.querySelector('div.mx-0 > div.col-md-10 > a > span.text-monospace')?.innerHTML?.toLowerCase()
  console.log(`Got beaconcha MEV Fee Recipient ${beaconchaMEVFeeRecipient}`)
  data.push({slot, proposer_index, node_address, mev_fee_recipients: mevFeeRecips, fee_recipient: feeRecipient, beaconchaRelays, beaconchaMEVFeeRecipient})
}
const dataLines = ['slot,proposer_index,node_address,mev_fee_recipients,fee_recipient,beaconcha_relays,beaconcha_mev_fee_recipient']
for (const {slot, proposer_index, node_address, mev_fee_recipients, fee_recipient, beaconchaRelays, beaconchaMEVFeeRecipient} of data)
  dataLines.push([slot, proposer_index, node_address, mev_fee_recipients.map(x => `${x.relayName}:${x.feeRecipient}`).join(';'), fee_recipient, beaconchaRelays.join(';'), beaconchaMEVFeeRecipient].join(','))
writeFileSync('/home/ramana/Downloads/IncorrectFeeRecipientSlotsBeaconcha.csv', dataLines.join('\n'))
