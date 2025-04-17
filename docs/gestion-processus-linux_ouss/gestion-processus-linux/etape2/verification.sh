#!/bin/bash
if ! ps aux | grep -q '[s]leep 600'; then
    echo "done"
    exit 0
else
    echo "Des processus sleep 600 sont encore actifs"
    exit 1
fi