## Tools for data gathering
### Dependencies
- [nodejs & npm](https://nodejs.org/en)
- [jq](https://jqlang.github.io/jq/)
- [g[un]zip](https://www.gnu.org/software/gzip/)
- Access to an Ethereum archive node, providing JSON-RPC for both execution & consensus (beacon) APIs.
- [Flashbots Boost Relay Data](https://flashbots-boost-relay-public.s3.us-east-2.amazonaws.com/index.html)

### Installation
- `npm install` to install the Node.js dependencies.
- Download the Flashbots Boost relay data `.json.gz` files (for the desired slots to analyse) into the `data` directory.

### Usage
- Run `./submissions-to-bids.sh data/builder-submissions_slot-<fromSlot>-to-<toSlot>.json.gz` for each of the relay data files.
- See `node run --help` for more options.
- `node run -s <fromSlot> -t <toSlot>` to create a csv file `data/mevtheft_slot-<fromSlot>-to-<toSlot>.csv` with analysis data.


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