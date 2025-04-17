#!/bin/bash
if systemctl is-enabled ssh | grep -q enabled; then
    echo "done"
    exit 0
else
    echo "Le service SSH n'est pas activé"
    exit 1
fi