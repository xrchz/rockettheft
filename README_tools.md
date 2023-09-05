## Getting data for rETH balances
### File format
describe what the columns are, that they're in hex, blah, blah. Consider an example

### Downloading balances.jsonl
The file is available at https://github.com/xrchz/rockettrack/blob/main/balances.jsonl

### Generating balances.jsonl
high level description of what to do, then go into using the tool as it exists on rockettrack

#### Dependencies

#### Usage


## Getting data for rETH balances
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
  - `balances.jsol`
  - any number of `rockettheft_slot-###-to-###.csv` csv data files
- Run analysis.py
  - You'll get a whole bunch of output in console, as well as updated plot images and issue csvs
  - ./README.md will use the latest plot images
  - The issue csvs are there for follow up analysis or action if desired