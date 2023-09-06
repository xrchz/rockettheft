## Getting data for rETH balances

We store historical protocol prices of Rocket ether (rETH) in JSON lines format for easy access.

### File format
Each line is a JSON list of 5 strings representing numbers in hexadecimal format (base 16 with leading `0x`). The items are: block number, total ETH deposited for minting Rocket ether, total ETH staked on the beacon chain by Rocket Pool, total supply of Rocket ether, and timestamp (seconds since Unix epoch).
To calculate the protocol price of Rocket ether at the block/time for a given line, divide the total ETH deposited (2nd item) by the Rocket ether supply (4th item).

For example, for block `18011520` (`0x0112d580`), the corresponding line is
```
["0x0112d580","0x75e2375c2c8796590b8e","0x6a0e872f43782789c623","0x6cf772f8e9aa484dfd07","0x64ec4a0f"]
```
The total ETH deposited is `556689831768737674428416` (`0x75e2375c2c8796590b8e`) and the rETH supply is `514580210564560052027392` (`0x6cf772f8e9aa484dfd07`). Thus, the rETH price (per ETH) for this block is `556689831768737674428416` ÷ `514580210564560052027392` = `1.081832958865592601`.

### Downloading balances.jsonl
The file is available at https://github.com/xrchz/rockettrack/blob/main/balances.jsonl, which is updated occassionally.

### Generating balances.jsonl
To generate an up-to-date version of the file yourself, you can run the update balances script in the repository above.

#### Dependencies
- [Node.js](https://nodejs.org/en) 18+
- Access to an Ethereum RPC archive node

#### Usage
1. Clone the [rockettrack repository](https://github.com/xrchz/rockettrack): `git clone https://github.com/xrchz/rockettrack`.
2. Install the JavaScript dependencies: `npm install`.
3. (For each desired update): Run the update script: `./updatebalances.js`. See `./updatebalances.js --help` for more options.
The generated file `balances.jsonl` will be created and/or appended to in the current directory.

## Getting per-slot data
We retrieve the MEV-boost bids and payloads delivered by querying the Rocket-Pool-approved relays, to assess the possible and actual value of each block.
We also retrieve the block proposer to check whether they are part of a Rocket Pool node, and get extra information about them if so to determine e.g. the rETH share and whether the correct fee recipient was used.
Data from queries to the relay APIs, and some of the Rocket Pool node information, is cached using LMDB with the database stored in the `db` directory.
Data for analysis is stored in CSV format, detailed below, in the `data` directory.

### File format
Each CSV file is called `rockettheft_slot-<startSlot>-to-<endSlot>.csv` for a given `startSlot` to `endSlot` range (both inclusive).
The CSV header is as follows:
`slot,max_bid,max_bid_relay,mev_reward,mev_reward_relay,proposer_index,is_rocketpool,node_address,in_smoothing_pool,correct_fee_recipient,priority_fees,avg_fee,eth_collat_ratio`
The columns have the following meaning:
- `slot`: The slot number in decimal format, e.g. `5996922`. If this slot was missed (no execution block), all the other fields are missing.
- `max_bid`: The maximum block value (in wei) retrieved as a proposed bid from any Rocket-Pool-approved relay for this block, e.g. `32224645557269417`. This field is missing if no Rocket-Pool-approved relays provided any bids.
- `max_bid_relay`: The name of the relay that supplied the `max_bid`, e.g. `Ultra Sound`. This field is missing if the `max_bid` field is missing.
- `mev_reward`: The value of the proposed block delivered by a Rocket-Pool-approved relay, e.g. `31859537951006424`. We check that only one block payload is delivered across all the Rocket-Pool-approved relays. This field is missing if no MEV-boosted payload was delivered.
- `mev_reward_relay`: A semicolon-separated list of relay names for the Rocket-Pool-approved relays that delivered the `mev_reward` block payload, e.g. `Flashbots;Ultra Sound` or `Blocknative`.
- `proposer_index`: The validator index for the block proposer in decimal, e.g. `318053`.
- `is_rocketpool`: Boolean (`true` or `false`) indicating whether the block proposer belonged to a Rocket Pool node, e.g. `false`. The remaining fields are all missing unless `is_rocketpool` is `true`.
- `node_address`: the (checksummed) address of the Rocket Pool node that owns the block proposer, e.g. `0x3c80c0a64E6e491F390c30ACC7114Bb431dC17aC`.
- `in_smoothing_pool`: Boolean indicating whether the node was in the smoothing pool for this block.
- `correct_fee_recipient`: Boolean indicating whether the fee recipient for this block (according to either the relay's payload if `mev_reward` is present, or the Beacon chain otherwise) was correct (either the smoothing pool if `in_smoothing_pool` is `true`, or the node's fee recipient otherwise).
- `priority_fees`: Sum of the priority fees (transaction fees above the base fee) for this block, e.g. `23364365081901709`. This field is missing if `mev_reward` is present.
- `avg_fee`: The Rocket Pool node's commission fee at this block, as wei out of one ether, e.g. `150000000000000000` representing 15%.
- `eth_collat_ratio`: The Rocket Pool node's ether collateralisation ratio at this block, which is the node's total (borrowed + bonded) ether compared to its bonded ether, as wei compared to one ether, e.g. `2000000000000000000` representing 1 bonded ETH for every 1 borrowed ETH.

TODO: describe these examples:
```
5996918,32224645557269417,Ultra Sound,31859537951006424,Flashbots;Ultra Sound,318053,false,,,,,,
5996922,,,,,525922,true,0xB81E87018Ec50d17116310c87b36622807581fa6,false,true,23364365081901709,150000000000000000,2000000000000000000
6920000,,,,,19572,false,,,,,,
6920021,589544030392734247,Ultra Sound,574345171451568684,Ultra Sound,565715,true,0x3c80c0a64E6e491F390c30ACC7114Bb431dC17aC,true,true,,150000000000000000,2000000000000000000
7125089,,,,,,,,,,,,
```

### Generating the CSV files
Each file's data can be collected using the main `run.js` script, which takes options to specify the desired start and end slot, as well as URLs for the Ethereum consensus and execution RPC nodes.
The data for different slot ranges can be collected in parallel, sharing the same database.
However simultaneous collection is best done from different IP addresses to avoid rate-limiting by the relay APIs; the script takes an optional proxy argument to specify an HTTP proxy to facilitate this.

#### Dependencies
- [Node.js](https://nodejs.org/en) 18+
- Access to an Ethereum execution layer RPC archive node
- Access to an Ethereum consensus layer RPC archive node

#### Usage
1. Clone the [rockettheft repository](https://github.com/xrchz/rockettheft): `git clone https://github.com/xrchz/rockettheft`.
2. Install the JavaScript dependencies: `npm install`.
3. (For each desired slot range): Run the data collection script: `./run.js -s <fromSlot> -t <toSlot>`. See `./run.js --help` for more options.
   - To specify custom URLs for the Ethereum nodes use the `--rpc <url>` and `--bn <url>` options.
   - To use an HTTP proxy when querying the relays, specify the `--proxy <prefix>` option and provide environment variables `PROXY<prefix>_URL` and `PROXY<prefix>_CREDS` with the URL and Basic authentication `<username>:<password>` for the proxy respectively. (Environment variables can be listed in, and will be read from, an `.env` file if desired.)


## Tools for analysis
### Dependencies
- python3
- python libraries: matplotlib, numpy, pandas

### Usage
- ./data must have:
  - A 7zip archive with the files used for analysis is provided on the repository; alternatively,
    please follow the appropriate sections to generate the data
  - `balances.jsol` (see [above](#getting-data-for-reth-balances))
  - any number of `rockettheft_slot-###-to-###.csv` csv data files (see
    [above](#getting-per-slot-data))
- Run analysis.py
  - You'll get a whole bunch of output in console, as well as updated plot images and issue csvs
  - ./README.md will use the latest plot images
  - The issue csvs are there for follow up analysis or action if desired
