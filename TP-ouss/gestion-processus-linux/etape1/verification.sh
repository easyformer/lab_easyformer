#!/bin/bash
if ps aux | grep -q '[s]ystemd'; then
    echo "done"
    exit 0
else
    echo "Le processus systemd n'est pas trouvé"
    exit 1
fi