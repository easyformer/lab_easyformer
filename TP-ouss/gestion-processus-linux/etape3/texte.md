## Étape 3 : Gestion des services

Utilisons le service Cron comme exemple :

Vérifiez le statut du service :
```bash
systemctl status cron
```{{exec}}

Activez le service au démarrage :
```bash
sudo systemctl enable cron
```{{exec}}

Démarrez le service :
```bash
sudo systemctl start cron
```{{exec}}

**Exercice :**
1. Activez et démarrez le service Cron
2. Vérifiez qu'il est bien actif
