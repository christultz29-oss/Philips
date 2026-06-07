# Setup Supabase — BO System

## 1. Crear el proyecto

1. Ir a https://supabase.com/dashboard
2. Click **New project**
3. Configurar:
   - **Name:** philips-bo-system
   - **Database Password:** (guárdala bien)
   - **Region:** US East (N. Virginia) — más cercano a Panamá
4. Esperar ~2 minutos a que el proyecto arranque

## 2. Obtener credenciales

En el dashboard de Supabase → **Project Settings → API**:

| Variable | Dónde encontrarla |
|---|---|
| `SUPABASE_URL` | Project URL (ej: `https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` key (solo para backend/n8n) |

En **Project Settings → Database**:

| Variable | Valor |
|---|---|
| `DB_HOST` | Host (ej: `db.xxxx.supabase.co`) |
| `DB_PASSWORD` | La que pusiste al crear el proyecto |
| `DB_PORT` | `5432` |

## 3. Aplicar las migraciones

Abre el **SQL Editor** en el dashboard de Supabase y ejecuta en orden:

```sql
-- Paso 1
-- Copiar y pegar el contenido de: supabase/migrations/001_schema.sql

-- Paso 2
-- Copiar y pegar el contenido de: supabase/migrations/002_storage.sql

-- Paso 3
-- Copiar y pegar el contenido de: supabase/migrations/003_bo_system.sql

-- Paso 4
-- Copiar y pegar el contenido de: supabase/migrations/004_views_kpis.sql
```

Luego ejecutar el seed:
```sql
-- Copiar y pegar: supabase/seed.sql
-- Copiar y pegar: supabase/seed_bo.sql
```

## 4. Crear los primeros usuarios

En **Authentication → Users → Invite user** (o Add user):

| Email | Rol a asignar |
|---|---|
| admin@philips-bo.com | admin |
| supervisor@philips-bo.com | supervisor |
| ols@philips-bo.com | ols |
| agente@philips-bo.com | agent |

Luego actualizar roles en SQL Editor:
```sql
UPDATE public.users SET role = 'admin'      WHERE id = (SELECT id FROM auth.users WHERE email = 'admin@philips-bo.com');
UPDATE public.users SET role = 'supervisor' WHERE id = (SELECT id FROM auth.users WHERE email = 'supervisor@philips-bo.com');
UPDATE public.users SET role = 'ols'        WHERE id = (SELECT id FROM auth.users WHERE email = 'ols@philips-bo.com');
-- agent es el default, no necesita update
```

## 5. Configurar la app

Crear el archivo `public/env.js` con:
```js
window.__ENV = {
  SUPABASE_URL: 'https://TU-PROJECT-ID.supabase.co',
  SUPABASE_ANON_KEY: 'TU-ANON-KEY'
};
```

Agregar en `public/index.html` ANTES de los otros scripts:
```html
<script src="/env.js"></script>
```

> ⚠️ Nunca committear `env.js` — ya está en `.gitignore`

## 6. Configurar n8n

En n8n (https://christultz.app.n8n.cloud):

### Credencial: Supabase Postgres
- Type: PostgreSQL
- Host: `db.TU-PROJECT-ID.supabase.co`
- Port: `5432`
- Database: `postgres`
- User: `postgres`
- Password: tu DB password
- SSL: **enabled**

### Variables de entorno en n8n
```
SLACK_CHANNEL_BO_ALERTS=#bo-alertas
SLACK_CHANNEL_BO_REPORTS=#bo-reportes
OLS_EMAIL=ols@philips-bo.com
```

### Importar workflows
En n8n → **Workflows → Import**:
1. `n8n/workflows/01_daily_aging_refresh.json`
2. `n8n/workflows/02_sla_breach_alert.json`
3. `n8n/workflows/03_monthly_report.json`

### Webhook URL para Supabase
Después de activar el workflow 02, copiar la webhook URL de n8n y configurarla en:
**Supabase → Database → Webhooks → Create Webhook**
- Table: `rma_cancellations`, `refund_requests`, `credit_notes`
- Events: UPDATE
- URL: la webhook URL de n8n workflow 02
- Filter: `NEW.sla_status = 'C_red' AND OLD.sla_status != 'C_red'`
