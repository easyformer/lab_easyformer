## Étape 1 : Surveillance des processus

Utilisez `ps` pour lister les processus :

```bash
ps aux | head -n 5
```{{exec}}

Utilisez `top` pour une surveillance en temps réel :

```bash
top -b -n 1 | head -n 10
```{{exec}}

**Exercice :**
1. Trouvez le PID du processus `systemd`
2. Notez l'utilisation mémoire de votre processus principal

<div style="text-align: right; font-style: italic; margin-top: 30px;">
by ouss
</div>