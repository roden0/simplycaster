# SimplyCaster Secrets

This directory contains Docker secrets for secure credential management.

## 🔐 Security Files

- `db_user.txt` - Database username
- `db_password.txt` - Database password  
- `db_name.txt` - Database name
- `jwt_secret.txt` - JWT signing secret (min 32 characters)
- `pepper_secret.txt` - Global password pepper (min 32 characters)

## 🚀 Quick Setup

### Development (Default Values)
The provided files contain development defaults. For local development, you can use these as-is.

### Production Setup
**⚠️ CRITICAL: Change all secrets before production deployment!**

```bash
# Generate secure secrets
openssl rand -base64 32 > secrets/jwt_secret.txt
openssl rand -base64 32 > secrets/pepper_secret.txt
echo "your_secure_db_password" > secrets/db_password.txt

# Set proper permissions
chmod 600 secrets/*.txt
```

## 🔒 Security Best Practices

### File Permissions
```bash
# Restrict access to secrets
chmod 600 secrets/*.txt
chown root:root secrets/*.txt  # In production
```

### Secret Rotation
- **JWT Secret**: Rotate monthly, invalidates all existing tokens
- **Pepper Secret**: Never rotate (breaks existing password hashes)
- **DB Password**: Rotate quarterly with proper coordination

### Production Deployment
- Use external secret management (AWS Secrets Manager, HashiCorp Vault)
- Never commit real secrets to version control
- Use different secrets per environment
- Monitor secret access and usage

## 🐳 Docker Integration

Secrets are automatically mounted to containers at `/run/secrets/`:
- `/run/secrets/db_user`
- `/run/secrets/db_password`
- `/run/secrets/db_name`
- `/run/secrets/jwt_secret`
- `/run/secrets/pepper_secret`

## 🔧 Environment Variables

The application reads secrets and constructs the DATABASE_URL:
```typescript
const dbUser = await Deno.readTextFile('/run/secrets/db_user');
const dbPassword = await Deno.readTextFile('/run/secrets/db_password');
const dbName = await Deno.readTextFile('/run/secrets/db_name');
const databaseUrl = `postgres://${dbUser}:${dbPassword}@db:5432/${dbName}`;
```

## ⚠️ Important Notes

- **Never commit real secrets** to version control
- **Use .gitignore** to exclude secret files in production
- **Backup secrets securely** using encrypted storage
- **Test secret rotation** in staging before production
- **Monitor for secret leaks** in logs and error messages