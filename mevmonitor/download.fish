#!/usr/bin/env fish
set -l era (string match -rg '(\d+)' $argv[1])
cat $argv[1] | while read -l line
  echo "read line $line"
  if string match -v -q "*mevmonitor*" $line
    continue
  end
  set -l name (string sub -s 10 -e 54 $line)
  set -l slots (string sub -s -15 $name)
  curl -L https://beta-data.mevmonitor.org/era-$era/$name.json.br -o $slots.json
end
