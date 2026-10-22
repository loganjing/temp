# Install @commonapp/emailkit

Install the module from its manifest into `vendor/@commonapp/emailkit` and add the manifest's `file:` dependency to the application package. The application must also install the manifest's runtime dependencies.

Map server-side environment variables to an explicit configuration object. The example is `config.env.example`; never commit real SMTP credentials.

```ts
import { createEmailClient } from '@commonapp/emailkit'

const email = createEmailClient({
  host: process.env.SMTP_HOST ?? '',
  port: Number(process.env.SMTP_PORT ?? 587),
  username: process.env.SMTP_USER || undefined,
  password: process.env.SMTP_PASS || undefined,
  from: {
    address: process.env.SMTP_FROM ?? 'noreply@example.com',
    name: process.env.SMTP_FROM_NAME ?? 'Application Team',
  },
})

const result = await email.send({
  to: 'person@example.com',
  subject: 'Example',
  text: 'Hello',
  html: '<p>Hello</p>',
})
```

`send()` and `sendTest()` return `sent`, `skipped`, or `failed`. An empty SMTP host disables delivery. The default is implicit TLS on port 465 and required STARTTLS on ports 25 and 587; set `secure` and `requireTLS` explicitly when the server uses another policy. Username and password must be provided together; both may be omitted for an unauthenticated relay.

The module does not read environment variables, log errors, retry delivery, or persist an outbox. The host application owns configuration loading, safe logging, retry policy, and message templates. Call `close()` during application shutdown.
