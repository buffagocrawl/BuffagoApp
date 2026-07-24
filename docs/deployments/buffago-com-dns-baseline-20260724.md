# buffago.com DNS baseline — 2026-07-24

Read-only baseline captured before any DNS change. No DNS change was made.

- Authoritative nameservers: `nsg1.namebrightdns.com`, `nsg2.namebrightdns.com`
- SOA administrator: `dns.namebright.com`
- SOA serial observed: `2026072401`
- Apex A records: `54.243.117.197`, `13.223.25.84`
- `www` CNAME: `traff-https.hugedomains.com`
- Apex TXT: `afternic-verification-G9G3tM8T8EwEizzPzjGJWF`, `v=spf1 -all`
- MX query: no MX answer was returned by the resolver; this must be confirmed
  with the DNS owner before any change.

Any future Vercel connection must preserve all existing MX, TXT, SPF, DKIM, and
verification records and change only the records explicitly required by Vercel.
