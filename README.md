# 🎂 Birthday Reminder (web)

**Open the app:** https://aileng94.github.io/birthday-reminder-web/

A browser app for insurance agents. Add your Great Eastern ePartner **Policy Listing** PDF and it shows:

- **Birthday messages:** due today, missed in the last few days, and coming up. Each is drafted in English, 中文 or Bahasa Melayu, with a picture matched to the client's age and the client's name on it.
- **Policy alerts:** overdue premiums, lapsed policies, postponed proposals, clients with no active policy.
- **Premium forecast:** premiums falling due in the next 30 days.

**On a phone,** *Send via WhatsApp* opens the share menu: choose WhatsApp and the client, and the picture and message go together. **On a PC,** the picture downloads and the client's chat opens with the message typed.

## Privacy

- The PDF is read **inside your browser**. Nothing is uploaded to GitHub or anywhere else.
- Client data (listings, contacts, send history) is saved only in the browser you use, on that device. Use **Settings & backup → Download backup / Restore backup** to move it between your phone and PC.
- This repository contains **no client data**, only the app.
- Messages are never sent automatically; you press Send in WhatsApp.

## Customising

- `templates.json`: birthday wording options.
- `pictures/young|adult|mature|senior`: birthday pictures by age. File tags: `.zh` = Chinese-language clients only, `.en-zh` = English and Chinese clients. List them in `pictures/pictures.json`.
