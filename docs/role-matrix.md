# WMS role matrix

This file records the active operational ownership. `ADMIN` keeps the global
guard bypass and is omitted from repetitive cells below.

| Capability                       | RECEIVER | SHIPPER      | PRINTER | COUNTER | MANAGER      |
| -------------------------------- | -------- | ------------ | ------- | ------- | ------------ |
| Receive/confirm GRN              | Operate  | —            | —       | —       | Approve/view |
| Put away inbound stock           | Operate  | —            | —       | —       | View         |
| Claim and pick Goods Issue       | —        | Owner only   | —       | —       | View         |
| Package picked Shipment          | —        | Owner only   | —       | —       | View         |
| Print and put away `CUP_PRINTED` | —        | —            | Operate | —       | View         |
| Count stock / propose scrap      | —        | —            | —       | Operate | Approve/view |
| Inspect and restock returns      | Operate  | Handoff only | —       | —       | View         |

`PICKER` is a deprecated compatibility enum only. New users cannot be assigned
that role, runtime picking endpoints do not authorize it, and deploys must run
`pnpm migrate:picker-to-shipper` once to convert legacy staff records.

Carrier documents and assignment endpoints remain readable for legacy data,
but the active Shipper flow creates carrierless Shipments and uses WMS package
barcodes. Inbound GRN behavior is intentionally unchanged.
