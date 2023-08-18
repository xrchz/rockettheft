# RocketTheft
Tools for analysing and analysis of the performance of Rocket Pool validators in collecting priority
fees and MEV, and detecting MEV theft. Built for the Rocket Pool GMC's
[Bounty BA032304](https://dao.rocketpool.net/t/july-2023-gmc-call-for-bounty-applications-deadline-is-july-15th/1936/6).

## Analysis
We'll start high level and then go deeper.

This first draft is looking at ~1.7 weeks of data.

### Global vs RP sanity check
![image](./results/global_vs_rp.png)

The plot above shows a survival function for bids on all blocks and just RP blocks. This is mostly a
sanity check looking at if RP is being consistently lucky or unlucky, and we see no evidence that we
get better or worse bids. The curves move alongside each other well until data becomes too sparse to
be relied on at all.

### Is there systematic theft?
![image](./results/rp_subcategories.png)

The plot above is likely the most important item in this analysis. It shows whether we routinely see
high bids on blocks where either the recipient is wrong or vanilla blocks are used. If we see either
of these issues, especially for lottery blocks, that would be significant evidence of theft.

We do not see any such evidence. This dataset doesn't have any wrong recipient data. Slots where
vanilla is used seem to have slightly _lower_ bids, if anything.

> **Reading these survival function plots**  
> For a point on the line, we can read it as "what is the probability (see y-axis) that we get a
> Bid of at least _this much_ (see x-axis)"? The theft hypothesis is that high value blocks would be
> over-represented (higher probability) for the lines other than "RP - correct MEV boost" (because
> thieves would opportunistically target valuable blocks).

### Current losses

Running `analysis.py` provides some text in addition to making the plots:

```
=== Recipient losses ===
1: 0 of 1977 used wrong fee recipient (see results/recipient_losses.csv)
3a: 0.000 total ETH lost due to wrong fee recipient
3b: 0.000 ETH lost per week
3c: APY was 4.35% when it should have been 4.35%

=== Vanilla losses ===
There were 129 vanilla RP blocks
  91 had bids; we can get loss (see results/vanilla_losses.csv)
  38 of them had no bid; we'll use the mean of the above as a guess
4a: ~8.701 known ETH lost due to not using relays
4b: ~5.159 ETH lost per week
4c: APY was 4.35% when it could have been ~4.48%
 aka, a 2.79% performance hit
 ```

The main take-away I found here is that vanilla blocks do represent a real performance hit.

## Tools
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
