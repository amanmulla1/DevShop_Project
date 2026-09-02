# DevShop — Ansible Vault

Sensitive values are stored **encrypted** with Ansible Vault.

## Where the secrets live

The playbooks are driven by `inventory/group_vars/all/vault.yml` (encrypted),
which Ansible auto-decrypts at run time. The decrypted values are never written
to Git.

The committed `inventory/group_vars/all/vault.yml.example` documents the
**required keys** (with placeholders only):

- `db_name`, `db_username`, `db_password`
- `jwt_secret` (must be ≥ 32 characters)
- `admin_email`, `admin_password`, `admin_name`

## Create the encrypted vault

From the `ansible/` directory:

```bash
ansible-vault create inventory/group_vars/all/vault.yml --vault-id devshop@prompt
# paste the keys from vault.yml.example with real values, then save & exit
```

`inventory/group_vars/all/vault.yml` is git-ignored, so its encrypted contents
are never committed by accident. If you want to commit the *encrypted* file, use
`git add -f inventory/group_vars/all/vault.yml` (only the ciphertext is stored).

## Edit / view

```bash
ansible-vault edit   inventory/group_vars/all/vault.yml --vault-id devshop@prompt
ansible-vault view   inventory/group_vars/all/vault.yml --vault-id devshop@prompt
```

## Run the playbook with the vault

```bash
# Interactive (prompts for the vault password)
ansible-playbook -i inventory/hosts.ini --ask-vault-pass playbooks/site.yml

# Or point at a password file (do not commit the file)
DEVSHOP_VAULT_FILE=~/.secrets/devshop.vault-pass ./scripts/deploy.sh
```

## Security notes

- Never put plaintext secrets in playbooks, templates, vars, inventory, or Git.
- The `.env` file rendered on the server (`/opt/devshop/.env`) is written with
  Ansible `no_log: true` and mode `0600`.
- If this repository ever becomes private, GitHub deploy keys, SSH keys, or a
  token can be provided via environment/secret mechanism — never hard-coded.
