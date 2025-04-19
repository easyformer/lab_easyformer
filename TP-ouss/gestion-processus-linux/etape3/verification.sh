#!/bin/bash
if systemctl is-active cron | grep -q active && \
   systemctl is-enabled cron | grep -q enabled; then
    echo "done"
    exit 0
else
    echo "Le service Cron n'est pas correctement configuré"
    exit 1
fi
