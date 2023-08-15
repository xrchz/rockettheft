#!/bin/sh
gunzip -c $1 |\
  jq -c 'reduce .[] as $i ({}; . + {($i.slot): (.[$i.slot] + [$i.value])})' |\
  gzip > ${1/builder-submissions/bid-values}
