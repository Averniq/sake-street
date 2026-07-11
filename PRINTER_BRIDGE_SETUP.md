# iVida LAN Kitchen Printer Setup

The print bridge runs on an always-on Windows kitchen computer. It reads new orders from Supabase and sends ESC/POS data directly to the printer over LAN.

## Requirements

- iVida thermal receipt printer connected to the same router as the kitchen computer
- Printer configured with a fixed LAN IP address
- Node.js LTS installed on the kitchen computer
- Existing Sake Street staff email and password

## Setup

1. Run `supabase-kitchen-print-queue.sql` once in the Supabase SQL Editor.
2. Before starting the bridge for the first time, run
   `supabase-kitchen-print-baseline.sql` once. This prevents existing orders
   from being printed as a historical backlog. Do not run this file again
   after automatic printing is live.
3. Copy `printer-bridge.config.example.json` to `printer-bridge.config.json`.
4. Edit `printer-bridge.config.json` and set:
   - `staffPassword`
   - Keep `outputMode` as `file` while testing without the iVida printer
   - Later change `outputMode` to `lan`, then set `printerIp`
   - `printerPort` is normally `9100`
5. Check the LAN connection:

   ```powershell
   node printer-bridge.mjs --check-printer
   ```

6. Send a sample kitchen docket:

   ```powershell
   node printer-bridge.mjs --test-print
   ```

   In File Test Mode this creates readable `.txt` and raw `.escpos` files inside `printer-output`. Open the `.txt` file to inspect it or print it with a normal home printer. The sample test does not require the staff password.

7. Start automatic printing:

   ```powershell
   node printer-bridge.mjs
   ```

   You can also double-click `start-printer-bridge.cmd`.

## Important

- Keep `printer-bridge.config.json` only on the kitchen computer. It is excluded from Git because it contains the staff password.
- Files in `printer-output` are test artifacts and are also excluded from Git.
- Do not put the Supabase service-role key in this file. The bridge uses the normal staff login and existing row-level security.
- A job is marked printed only after the printer accepts the TCP data. Failed jobs are retried after two minutes, up to ten attempts.
- The bridge prints only orders with `New` or `Preparing` status that have not already been printed.
- Use a DHCP reservation or static IP so the printer address does not change after a router restart.
