# Incrementeel synchroniseren van bestellingen

Datum: 2026-09-13

## Probleem

Elke keer dat het bestellingenpaneel opengaat, toont `OrdersModal` eerst de cache en
vuurt daarna een achtergrondverversing af (`GET /api/orders?refresh=1`). Die verversing
roept `fetchAllOrdersForEmail(email)` aan, wat neerkomt op een volledige WooCommerce-
zoekopdracht op het e-mailadres met `per_page=50` — ongeacht of dezelfde zoekopdracht
gisteren al is gedaan.

Voor een gesprek dat wekenlang loopt betekent dat tientallen identieke zoekopdrachten
over dezelfde bestellingen.

## Oplossing

Onthoud per gesprek tot welk moment er gesynchroniseerd is, en vraag WooCommerce daarna
alleen nog naar wat er sindsdien is veranderd.

### Watermerk

Nieuwe kolom `conversations.orders_synced_at` (TEXT, nullable, ISO8601 in UTC), toegevoegd
via het bestaande `try { ALTER TABLE … } catch {}`-migratiepatroon in `lib/db.ts`.

Per gesprek, omdat `customer_orders` ook per gesprek is gekoppeld.

### Drie paden in `GET /api/orders`

| situatie | gedrag |
|---|---|
| nog niets gekoppeld | Ongewijzigd: volledige auto-detectie via ordernummer → e-mail → telefoon. Incrementeel kan hier niet, de klant is nog onbekend. Zet het watermerk zodra er bestellingen zijn opgeslagen. |
| paneel openen (`refresh=1`) | Stuur `modified_after = orders_synced_at` mee. Alleen nieuwe en gewijzigde bestellingen. Zet daarna het watermerk. Zonder watermerk (eerste keer) valt dit terug op een volledige zoekopdracht. |
| vernieuwknop (`refresh=full`) | Negeert het watermerk en haalt alles op. Zet daarna het watermerk. |

### `modified_after`, niet `after`

`after` filtert op aanmaakdatum. Een bestelling van 20 augustus die op 11 september
wordt verzonden, zou dan nooit meer opgehaald worden en dus nooit een track&trace-code
krijgen in de app. `modified_after` dekt nieuwe én gewijzigde bestellingen.

### Tijdzone

`fetchAllOrdersForEmail(email, modifiedAfter?)` stuurt naast `modified_after` ook
`dates_are_gmt=true` mee. WooCommerce interpreteert zo'n datum anders in de tijdzone van
de site, terwijl het watermerk in UTC wordt opgeslagen — zonder die vlag mis je in de
zomer twee uur aan bestellingen.

De datum gaat als `YYYY-MM-DDTHH:MM:SS` de query in (zonder `Z`), wat samen met
`dates_are_gmt=true` ondubbelzinnig is.

### Overlap van 5 minuten

Het watermerk wordt gezet op het moment dat de synchronisatie *begon*, min vijf minuten.
Dat vangt twee dingen op:

- bestellingen die tijdens de aanroep zelf gewijzigd worden;
- klokverschil tussen deze server en de WordPress-host.

De prijs is dat er soms een handvol bestellingen dubbel wordt opgehaald. Die worden toch
al ge-upsert op `(conversation_id, wc_order_id)`, dus dat is gratis.

### Falen schuift het watermerk niet op

Bij een fout blijft `orders_synced_at` staan op de vorige waarde, zodat de volgende
poging de overgeslagen periode alsnog meeneemt. Eén time-out mag geen permanent gat in
de geschiedenis slaan. Het bestaande gedrag — cache tonen met `refreshError` — blijft.

## Wat er niet verandert

Samenvoegen van `match_sources`, ontkoppelde bestellingen (`dismissed_orders`), de
POST-zoekopdracht en de hele UI blijven ongemoeid. Visueel verandert er niets behalve dat
het paneel sneller klaar is.

## Verificatie

Er is geen testframework in dit project. Een los script controleert:

1. welke queryparameters richting WooCommerce gaan in beide modi, met een gestubde
   `fetch` — volledig zonder `modified_after`, incrementeel mét `modified_after` en
   `dates_are_gmt=true`;
2. tegen een tijdelijke SQLite-database dat het watermerk opschuift na een geslaagde
   synchronisatie en op zijn oude waarde blijft staan na een fout.
