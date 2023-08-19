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

Note that the current method gets:
- Max bid from only Flashbots relay
  - This is used to calculate losses from vanilla blocks
- MEV reward from any builder/relay that uses the last transaction in a block to send it
  - This is used to calculate losses from incorrect fee recipients 
  - This method was validated on a few thousand slots for the cases that were serviced by Flashbots
  relay

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
4a: ~7.831 known ETH lost due to not using relays
4b: ~4.643 ETH lost per week
4c: APY was 4.35% when it could have been ~4.46%
  aka, a 2.51% performance hit
(Sanity checking 2 ways of estimating the unknown loss: 2.563 vs 2.368)
```

The main take-away I found here is that vanilla blocks do represent a real performance hit.

### Vanilla blocks: RP vs nonRP sanity check
![image](./results/vanilla_rp_vs_nonrp.png)

The plot above shows a survival function for bids on RP vanilla blocks vs non-RP vanilla blocks.
Ideally we'd expect the same curves to be followed (and they are). If they were different, we'd have
to try to interpret it from between various explanations.

### For reference: goals per the bounty

```
Detail level
1) For each MEV-boost block, check if an acceptable fee recipient was used
2) For each vanilla block, calculate how much was lost by not using MEV-boost

High level
3) Losses due to wrong fee recipient
  3a) Total ETH
  3b) ETH per period
  3c) Effect on APR
4) Losses due to not using MEV-boost
  4a) Total ETH
  4b) ETH per period
  4c) Effect on APR
5) Distribution of MEV-boost bids for
  5a) All block
  5b) All RP blocks
  5c) :star: All RP blocks that use MEV-boost w/correct fee recipient
  5d) :star: All RP blocks that use MEV-boost w/wrong fee recipient
  5e) :star: All vanilla RP blocks
```



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
