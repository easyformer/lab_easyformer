## Étape 2 : Manipulation des processus

Démarrez un processus en arrière-plan :

```bash
sleep 300 &
```{{exec}}

Listez les jobs :

```bash
jobs
```{{exec}}

Terminez un processus avec `kill` :

```bash
kill -l # Liste des signaux
```{{exec}}

**Exercice :**
1. Démarrez 2 processus `sleep 600`
2. Terminez le deuxième processus

<div style="text-align: right; font-style: italic; margin-top: 30px;">
by ouss
</div>