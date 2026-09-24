# Review

Self-review: diff is the existing child-process input connection plus isolated receipts. stdin preserves the exact prompt and avoids a per-argument OS size limit; no arbitrary prompt cap or evidence deletion. Existing executable trust and subscription-only environment remain intact. Local boundary check followed by actual Fable provider delivery, not only a mocked transport.

Still unverified: full chain at this revision, complete review coverage, bot behavior, clean Stop 1 rebuild and independent cold pull. The original Mercury output-length failure and dropped failed-result history are separate defects, not repaired or hidden here.
