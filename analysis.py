from collections import Counter
import json
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

# max bid isn't always used (eg, bid gets in too late); 90% is a rough empirical correction
BID2REWARD = 0.9
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


def wei2eth(wei_str):
    try:
        return int(wei_str) / 1e18
    except ValueError:
        return np.nan


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

    timediff = 999999999
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


def fix_bloxroute_missing_bids(df):
    ct = 0
    for ind, row in df.iterrows():
        missing_bid = np.isnan(row['max_bid']) and ~np.isnan(row['mev_reward'])
        missing_winning_bid = (~np.isnan(row['max_bid']) and ~np.isnan(row['mev_reward'])
                               and row['max_bid'] < row['mev_reward'])
        if missing_bid or missing_winning_bid:
            assert row['mev_reward_relay'] in ('bloXroute Max Profit', 'bloXroute Regulated')
            ct += 1
            df.loc[ind, 'max_bid'] = row['mev_reward'] / BID2REWARD
    print(f'Filled in proxy bloxroute max_bids for {ct} slots')
    return df


def recipient_losses_mevboost(df, total_weeks, rethdict):
    df_rp_mevboost = df[~df['is_vanilla'] & df['is_rocketpool']].copy()
    num_right = len(df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == True])
    num_wrong = len(df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == False])
    num = len(df_rp_mevboost)
    assert num == num_wrong + num_right
    lost_eth = df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == False]['mev_reward']
    lost_eth.to_csv('./results/recipient_losses.csv')

    nolossd = rethdict.copy()
    nolossd['end_eth'] += sum(lost_eth)

    print('\n=== MEV-Boost Recipient losses ===')
    print(f'1: {num_wrong} of {num} MEV-boost slots used wrong fee recipient (see '
          f'results/recipient_losses.csv)')
    print(f'3a: {sum(lost_eth):0.3f} total ETH lost due to wrong fee recipient')
    print(f'3b: {sum(lost_eth)/total_weeks:0.3f} ETH lost per week')
    print(f'3c: APY was {rethdict2apy(rethdict):0.2f}% '
          f'when it should have been {rethdict2apy(nolossd):0.2f}%')

    issue_nodes = df_rp_mevboost[df_rp_mevboost['correct_fee_recipient'] == False]['node_address']
    return Counter(issue_nodes)


def recipient_losses_vanilla(df, total_weeks, rethdict):
    df_rp_vanilla = df[df['is_vanilla'] & df['is_rocketpool']].copy()
    num_right = len(df_rp_vanilla[df_rp_vanilla['correct_fee_recipient'] == True])
    num_wrong = len(df_rp_vanilla[df_rp_vanilla['correct_fee_recipient'] == False])
    num = len(df_rp_vanilla)
    assert num == num_wrong + num_right
    df_rp_vanilla['potential_loss'] = (
        df_rp_vanilla['max_bid'].fillna(0) * BID2REWARD + df_rp_vanilla['priority_fees'].fillna(0))
    # NOTE: this assumes priority fees are only provided when max_bid is missing

    lost_eth = df_rp_vanilla[df_rp_vanilla['correct_fee_recipient'] == False]['potential_loss']
    lost_eth.to_csv('./results/recipient_losses_vanilla.csv')

    nolossd = rethdict.copy()
    nolossd['end_eth'] += sum(lost_eth)

    print('\n=== Vanilla Recipient losses ===')
    print(f' {num_wrong} of {num} vanilla slots used wrong fee recipient (see '
          f'results/recipient_losses_vanilla.csv)')
    print(f'~{sum(lost_eth):0.3f} total ETH lost due to wrong fee recipient')
    print(f'~{sum(lost_eth)/total_weeks:0.3f} ETH lost per week')
    print(f' APY was ~{rethdict2apy(rethdict):0.2f}% '
          f'when it should have been {rethdict2apy(nolossd):0.2f}%')
    print("NB: We take a stab at vanilla losses using 90% of max_bid or sum of priority_fees, but "
          "it's possible for vanilla blocks without max_bid to hide offchain fees")
    issue_nodes = df_rp_vanilla[df_rp_vanilla['correct_fee_recipient'] == False]['node_address']
    return Counter(issue_nodes), sum(lost_eth)


def vanilla_losses(df, total_weeks, rethdict, vanilla_bad_recipient_eth):
    df_temp = df.copy()
    df_temp['proxy_max_bid'] = df_temp['max_bid'].rolling(7, center=True, min_periods=1).mean()
    df_rp_vanilla = df_temp[df_temp['is_vanilla'] & df_temp['is_rocketpool']]
    n = len(df_rp_vanilla)
    unknown_vanilla = df_rp_vanilla[df_rp_vanilla['max_bid'].isna()]
    assert not unknown_vanilla['priority_fees'].isna().any()
    n_unknown = len(unknown_vanilla)
    lost_eth = df_rp_vanilla[~df_rp_vanilla['max_bid'].isna()]['max_bid'] * BID2REWARD
    assert n == len(lost_eth) + n_unknown
    lost_eth.to_csv('./results/vanilla_losses.csv')
    estimated_lost_eth = lost_eth.mean() * n_unknown
    vanilla_received_eth = df_rp_vanilla['priority_fees'].sum() - vanilla_bad_recipient_eth
    total_loss = sum(lost_eth) + estimated_lost_eth - vanilla_received_eth

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

    proxy_losses = df_rp_vanilla[df_rp_vanilla['max_bid'].isna()]['proxy_max_bid']
    assert not proxy_losses.isna().values.any()  # make sure we have values for all
    alt_estimated_lost_eth = sum(proxy_losses)
    print(f"\nSanity checking 2 ways of estimating the unknown loss: {estimated_lost_eth:0.3f} vs "
          f"{alt_estimated_lost_eth:0.3f}")
    print(" if second method is much higher, that means we're seeing vanilla block more often than"
          " expected during periods that tend to have high max bids, which is a yellow flag")

    issue_nodes = df_rp_vanilla['node_address']
    return Counter(issue_nodes)


def get_sf(ls):
    ls = sorted(ls)
    x, y_sf = [0], [1]

    for val in ls:
        x.append(val)
        y_sf.append(y_sf[-1] - 1 / len(ls))

    return x, y_sf


def distribution_plots(df):
    # note - in these plots, we only assess when there's a max bid; a validator that never
    # registered with relays (ie, always vanilla) would not show up in them at all
    unplotted_df = df[df['max_bid'].isna() & df['is_rocketpool']]
    unplotted_df.to_csv('./results/unplotted_rp_slots.csv')

    df = df[~df['max_bid'].isna()]
    df_rp = df[df['is_rocketpool']]
    df_rp_vanilla = df_rp[df_rp['is_vanilla']]
    df_rp_mev = df_rp[~df_rp['is_vanilla'] & df_rp['correct_fee_recipient'] == True]
    df_rp_bad_recipient = df_rp[df_rp['correct_fee_recipient'] == False]
    df_nonrp = df[df['is_rocketpool'] == False]
    df_nonrp_vanilla = df_nonrp[df_nonrp['is_vanilla']]

    all_x, all_sf = get_sf(df['max_bid'])
    rp_x, rp_sf = get_sf(df_rp['max_bid'])
    rp_vanilla_x, rp_vanilla_sf = get_sf(df_rp_vanilla['max_bid'])
    rp_mev_x, rp_mev_sf = get_sf(df_rp_mev['max_bid'])
    df_rp_bad_recipient_x, df_rp_bad_recipient_sf = get_sf(df_rp_bad_recipient['max_bid'])
    nonrp_vanilla_x, nonrp_vanilla_sf = get_sf(df_nonrp_vanilla['max_bid'])

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
    ax.semilogy(rp_mev_x, rp_mev_sf, marker='.', label='RP - correct MEV boost')
    ax.semilogy(rp_vanilla_x, rp_vanilla_sf, marker='.', label='RP - vanilla')
    ax.semilogy(
        df_rp_bad_recipient_x, df_rp_bad_recipient_sf, marker='.', label='RP - wrong recipient')
    ax.legend()
    ax.set_xlabel('Bid (ETH)')
    ax.set_ylabel('SF (proportion of blocks with at least x axis bid)')
    fig.savefig('./results/rp_subcategories.png', bbox_inches='tight')

    # yokem suggestion Vanilla Blocks - RP vs non
    fig, ax = plt.subplots(1)
    ax.semilogy(nonrp_vanilla_x, nonrp_vanilla_sf, marker='.', label='Vanilla - nonRP')
    ax.semilogy(rp_vanilla_x, rp_vanilla_sf, marker='.', label='Vanilla - RP')
    ax.legend()
    ax.set_xlabel('Bid (ETH)')
    ax.set_ylabel('SF (proportion of blocks with at least x axis bid)')
    fig.savefig('./results/vanilla_rp_vs_nonrp.png', bbox_inches='tight')

    issue_nodes = unplotted_df['node_address']
    return Counter(issue_nodes)


def main():
    start_slot, end_slot = 0, 0

    p = 'rockettheft_slot-0-to-0.csv'
    df_ls = []
    for p in sorted(Path(r'./data').glob('*.csv')):
        if start_slot == 0:
            start_slot = int(p.name.split('-')[1])
        df_ls.append(
            pd.read_csv(
                p,
                converters={
                    'max_bid': wei2eth,
                    'mev_reward': wei2eth,
                    'priority_fees': wei2eth,
                }))
    end_slot = int(p.name.split('-')[3].split('.')[0])
    assert end_slot != 0  # maybe hits if there's no data
    total_weeks = (end_slot - start_slot) * 12 / (60 * 60 * 24 * 7)
    rethdict = get_rethdict(start_slot, end_slot)
    print(rethdict)

    df = pd.concat(df_ls)
    df = df[df['proposer_index'].notna()]
    df['is_vanilla'] = df['mev_reward'].isna()
    df.set_index('slot', inplace=True)

    print(f'Analyzing {total_weeks:0.1f} weeks of data ({end_slot - start_slot} slots)')
    df = fix_bloxroute_missing_bids(df.copy())

    c_rcpt_mev = recipient_losses_mevboost(df.copy(), total_weeks, rethdict.copy())
    c_rcpt_van, van_bad_rcpt_eth = recipient_losses_vanilla(df.copy(), total_weeks, rethdict.copy())
    c_van = vanilla_losses(df.copy(), total_weeks, rethdict.copy(), van_bad_rcpt_eth)
    c_unplotted = distribution_plots(df.copy())

    print('\n=== RP issue counts by node address ===')
    print(f'🚩Wrong recipient used with MEV-boost: {c_rcpt_mev}')
    print(f'🚩Wrong recipient used with vanilla: {c_rcpt_van}')
    print(f'⚠ No max bid: {c_unplotted}')  # not registered w/relays? hard to differentiate theft
    print(f'⚠ Vanilla blocks: {c_van}')


if __name__ == '__main__':
    main()

# TODO check if theres's a period where nimbus bug caused issues that we should exclude
#      that data; it might be May/June 2023
