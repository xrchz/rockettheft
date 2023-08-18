import json
from pathlib import Path

import matplotlib.pyplot as plt
import pandas as pd
"""
===QUESTIONS TO ADDRESS FOR BOUNTY==
Detail level
✓1 For each MEV-boost block, check if an acceptable fee recipient was used
✓2 For each vanilla block, calculate how much was lost by not using MEV-boost

High level
✓3 Losses due to wrong fee recipient
  3a Total ETH
  3b ETH per period
  3c Effect on APR
✓4 Losses due to not using MEV-boost
  4a Total ETH
  4b ETH per period
  4c Effect on APR
✓5 Distribution of MEV-boost bids for
  5a All block
  5b All RP blocks
  5c :star: All RP blocks that use MEV-boost w/correct fee recipient
  5d :star: All RP blocks that use MEV-boost w/wrong fee recipient
  5e :star: All vanilla RP blocks
"""


def wei2eth(wei):
    return wei / 1e18


def slot2timestamp(slot):
    return 1606824023 + 12 * slot


def get_rethdict(start_slot, end_slot):
    start_time = slot2timestamp(start_slot)
    end_time = slot2timestamp(end_slot)
    start_eth, start_reth, end_eth, end_reth = 0, 0, 0, 0

    with open('./data/balances.jsonl', 'r') as f:
        ls = [json.loads(line) for line in f]

    timediff = 999999999
    for _block, totalETH, _stakingEth, rethSupply, time in ls:
        time = int(time, 16)
        newtimediff = abs(time - start_time)
        if newtimediff < timediff:
            start_eth = int(totalETH, 16)
            start_reth = int(rethSupply, 16)
            timediff = newtimediff
        if time > start_time:
            break

    for _block, totalETH, _stakingEth, rethSupply, time in ls:
        time = int(time, 16)
        newtimediff = abs(time - end_time)
        if newtimediff < timediff:
            end_eth = int(totalETH, 16)
            end_reth = int(rethSupply, 16)
            timediff = newtimediff
        if time > end_time:
            break

    years = (end_time - start_time) / (60 * 60 * 24 * 365.25)
    return {
        'start_eth': wei2eth(start_eth),
        'start_reth': wei2eth(start_reth),
        'end_eth': wei2eth(end_eth),
        'end_reth': wei2eth(end_reth),
        'years': years,
    }


def rethdict2apy(d):
    return 100 * ((d['end_eth'] / d['end_reth']) - (d['start_eth'] / d['start_reth'])) / d['years']


def recipient_losses(df, total_weeks, rethdict):
    df_rp_mevboost = df[~df['is_vanilla'] & df['proposer_is_rocketpool']]
    num_right = len(df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == True])
    num_wrong = len(df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == False])
    num = len(df_rp_mevboost)
    assert num == num_wrong + num_right
    lost_eth = wei2eth(
        df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == False]['mev_reward'])
    lost_eth.to_csv('./results/recipient_losses.csv')

    nolossd = rethdict.copy()
    nolossd['end_eth'] += sum(lost_eth)

    print('\n=== Recipient losses ===')
    print(f'1: {num_wrong} of {num} used wrong fee recipient (see results/recipient_losses.csv)')
    print(f'3a: {sum(lost_eth):0.3f} total ETH lost due to wrong fee recipient')
    print(f'3b: {sum(lost_eth)/total_weeks:0.3f} ETH lost per week')
    print(f'3c: APY was {rethdict2apy(rethdict):0.2f}% '
          f'when it should have been {rethdict2apy(nolossd):0.2f}%')

    # stretch TODO: highlight repeat offenders


def vanilla_losses(df, total_weeks, rethdict):
    df_rp_vanilla = df[df['is_vanilla'] & df['proposer_is_rocketpool']]
    n = len(df_rp_vanilla)
    n_unknown = len(df_rp_vanilla[df_rp_vanilla['max_bid'] == 0])
    lost_eth = wei2eth(df_rp_vanilla[df_rp_vanilla['max_bid'] != 0]['max_bid'])
    assert n == len(lost_eth) + n_unknown
    lost_eth.to_csv('./results/vanilla_losses.csv')
    total_loss = sum(lost_eth) + lost_eth.mean() * n_unknown

    nolossd = rethdict.copy()
    nolossd['end_eth'] += total_loss

    print('\n=== Vanilla losses ===')
    print(f'There were {n} vanilla RP blocks')
    print(f'  {len(lost_eth)} had bids; we can get loss (see results/vanilla_losses.csv)')
    print(f"  {n_unknown} of them had no bid; we'll use the mean of the above as a guess")
    print(f'4a: ~{total_loss:0.3f} known ETH lost due to not using relays')
    print(f'4b: ~{total_loss / total_weeks:0.3f} ETH lost per week')
    print(f'4c: APY was {rethdict2apy(rethdict):0.2f}% '
          f'when it could have been ~{rethdict2apy(nolossd):0.2f}%')
    print(f' aka, a {100*(1 - rethdict2apy(rethdict)/rethdict2apy(nolossd)):0.2f}% performance hit')

    # stretch TODO: highlight repeat offenders, especially if split between MEV boost and vanilla


def get_sf(ls):
    ls = sorted(ls)
    x, y_sf = [0], [1]

    for val in ls:
        x.append(val)
        y_sf.append(y_sf[-1] - 1 / len(ls))

    return x, y_sf


def distribution_plots(df):
    df['max_bid_eth'] = [wei2eth(int(x)) for x in df['max_bid']]
    df = df[df['max_bid_eth'] != 0]
    df_rp = df[df['proposer_is_rocketpool']]
    df_rp_vanilla = df_rp[df_rp['is_vanilla']]
    df_rp_mev_correct = df_rp[~df_rp['is_vanilla'] & df_rp['correct_fee_recipient'] == True]
    df_rp_mev_wrong = df_rp[~df_rp['is_vanilla'] & df_rp['correct_fee_recipient'] == False]

    all_x, all_sf = get_sf(df['max_bid_eth'])
    rp_x, rp_sf = get_sf(df_rp['max_bid_eth'])
    rp_vanilla_x, rp_vanilla_sf = get_sf(df_rp_vanilla['max_bid_eth'])
    rp_mev_correct_x, rp_mev_correct_sf = get_sf(df_rp_mev_correct['max_bid_eth'])
    rp_mev_wrong_x, rp_mev_wrong_sf = get_sf(df_rp_mev_wrong['max_bid_eth'])

    # 5a/5b Global vs RP -- ideally these look extremely similar
    fig, ax = plt.subplots(1)
    ax.semilogy(all_x, all_sf, marker='.', label='All')
    ax.semilogy(rp_x, rp_sf, marker='.', label='RP')
    ax.legend()
    ax.set_xlabel('Bid (ETH)')
    ax.set_ylabel('SF (proportion of blocks with at least x axis bid)')
    fig.savefig('./results/global_vs_rp.png', bbox_inches='tight')

    # 5c/5d/5e RP correct vs not
    # - If wrong recipient has higher probability for high bids, that is a very clear sign of theft
    # - If vanilla has higher probability for high bids, that is a sign of likely theft
    fig, ax = plt.subplots(1)
    ax.semilogy(rp_mev_correct_x, rp_mev_correct_sf, marker='.', label='RP - correct MEV boost')
    ax.semilogy(rp_mev_wrong_x, rp_mev_wrong_sf, marker='.', label='RP - wrong recipient')
    ax.semilogy(rp_vanilla_x, rp_vanilla_sf, marker='.', label='RP - vanilla')
    ax.legend()
    ax.set_xlabel('Bid (ETH)')
    ax.set_ylabel('SF (proportion of blocks with at least x axis bid)')
    fig.savefig('./results/rp_subcategories.png', bbox_inches='tight')


def main():
    start_slot, end_slot = 0, 0

    p = 'mevtheft_slot-0-to-0.csv'
    df_ls = []
    for p in sorted(Path(r'./data').glob('*.csv')):
        if start_slot == 0:
            start_slot = int(p.name.split('-')[1])
        df_ls.append(pd.read_csv(p))
    end_slot = int(p.name.split('-')[3].split('.')[0])
    assert end_slot != 0  # maybe hits if there's no data
    total_weeks = (end_slot - start_slot) * 12 / (60 * 60 * 24 * 7)
    rethdict = get_rethdict(start_slot, end_slot)

    df = pd.concat(df_ls)
    df = df[df['proposer_index'].notna()]
    df['is_vanilla'] = df['mev_reward'] == 0
    df.set_index('slot', inplace=True)

    print(f'Analyzing {total_weeks:0.1f} weeks of data')
    recipient_losses(df, total_weeks, rethdict)
    vanilla_losses(df, total_weeks, rethdict)
    distribution_plots(df)


if __name__ == '__main__':
    main()
