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
### File format
describe what the columns are, blah, blah. Include an example
`slot,max_bid,max_bid_relay,mev_reward,mev_reward_relay,proposer_index,is_rocketpool,node_address,in_smoothing_pool,correct_fee_recipient,priority_fees,avg_fee,eth_collat_ratio`

### Generating csvs
high level description of what to do, then go into using the tool as it exists on rockettrack

#### Dependencies

#### Usage


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
