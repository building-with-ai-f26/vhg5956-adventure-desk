const CASES = [
  {
    "id": "oak505",
    "name": "505 Oak Avenue, Carlsbad Village",
    "kind": "Historical research lead",
    "acquired": null,
    "status": "Acquisition date, deed and economics unverified | Secondary reported property sale: 2021-10-22 (not a verified CPP acquisition)",
    "claims": [
      {
        "text": "Indexed City permit text associates 505 Oak Avenue Partners LLC / Vic Gausepohl with older retail. This is not a verified purchase deed.",
        "url": "https://library.carlsbadca.gov/home/showpublisheddocument/18145/638581114316330000",
        "published": null,
        "event": null,
        "retrieved": "2026-11-09",
        "confidence": "Limited: indexed text; direct PDF unavailable",
        "type": "ownership / permit lead",
        "status": "reported / unverified",
        "geography": "Carlsbad Village, CA",
        "asset": "Retail",
        "units": "qualitative claim",
        "basis": "not applicable",
        "vintage": "retrieved 2026-11-09; original vintage unverified"
      },
      {
        "text": "Local report describes Little Victory Wine Bar and Always Hungry opening in Carlsbad Village. Later tenancy is not evidence it was predictable at acquisition.",
        "url": "https://www.carlsbad-village.com/post/little-victory-wine-bar-and-always-hungry-now-open-in-carlsbad-village",
        "published": null,
        "event": null,
        "retrieved": "2026-11-09",
        "confidence": "Publication and event dates need verification",
        "type": "later tenancy lead",
        "status": "reported / unverified",
        "geography": "Carlsbad Village, CA",
        "asset": "Retail",
        "units": "qualitative claim",
        "basis": "not applicable",
        "vintage": "retrieved 2026-11-09; original vintage unverified"
      },
      {
        "text": "PropertyShark reports a property sale on 2021-10-22. This does not verify the purchaser, founder ownership or CPP acquisition. Do not substitute this for a verified closing date in the investment reconstruction.",
        "url": "https://www.propertyshark.com/mason/Property/54068505/505-Oak-Ave-Carlsbad-CA-92008/",
        "published": null,
        "event": "2021-10-22",
        "retrieved": "2026-11-09",
        "confidence": "Secondary property record; deed/purchaser not verified",
        "type": "reported sale date",
        "status": "reported, not ownership-verified",
        "geography": "Carlsbad Village, CA",
        "asset": "Retail",
        "units": "sale event date",
        "basis": "not applicable",
        "vintage": "retrieved 2026-11-09; original publication unknown"
      }
    ]
  },
  {
    "id": "state3060",
    "name": "3060 State Street, Carlsbad Village",
    "kind": "Historical research lead",
    "acquired": null,
    "status": "Distinct parcel; registered-agent role does not prove equity ownership | Secondary reported property sale: 2020-08-06 (not a verified CPP acquisition)",
    "claims": [
      {
        "text": "Indexed City permit text names JVK FMK Venture I LLC and retail-to-restaurant conversion. Acquisition date and beneficial ownership remain unverified.",
        "url": "https://library.carlsbadca.gov/home/showpublisheddocument/20730/638816870215970000",
        "published": null,
        "event": null,
        "retrieved": "2026-11-09",
        "confidence": "Limited: indexed text; direct PDF unavailable",
        "type": "permit lead",
        "status": "reported / unverified",
        "geography": "Carlsbad Village, CA",
        "asset": "Retail",
        "units": "qualitative claim",
        "basis": "not applicable",
        "vintage": "retrieved 2026-11-09; original vintage unverified"
      },
      {
        "text": "Secondary directory associates Kirk Allison with a registered-agent role. Do not interpret that as proof of an ownership stake.",
        "url": "https://ca.ltddir.com/JVK/",
        "published": null,
        "event": null,
        "retrieved": "2026-11-09",
        "confidence": "Secondary directory; corroboration required",
        "type": "entity lead",
        "status": "reported / unverified",
        "geography": "Carlsbad Village, CA",
        "asset": "Retail",
        "units": "qualitative claim",
        "basis": "not applicable",
        "vintage": "retrieved 2026-11-09; original vintage unverified"
      },
      {
        "text": "Cushman & Wakefield Q2 2020 shopping-center survey: San Diego County direct vacancy 5.0% and asking rent $1.93/SF/month NNN; North County 6.2% and $1.86. These are broad survey context, not matched street-retail rents or property income. Original release date is unverified, so excluded from strict acquisition-time inference.",
        "url": "https://www.cushmanwakefield.com/-/media/cw/marketbeat-pdfs/2020/q2/us-reports/retail/sandiego_americas_marketbeat_retail_q22020.pdf?rev=1b6a6df8cb8a403498a3031e75c9f6cf",
        "published": null,
        "event": "2020-06-30",
        "retrieved": "2026-11-09",
        "confidence": "Published market survey; point-in-time availability and comparability unverified",
        "type": "market proxy",
        "status": "reported proxy, not property actual",
        "geography": "San Diego County / North County",
        "asset": "Shopping-center retail survey, not matched small street retail",
        "units": "vacancy %; asking rent $/SF/month NNN",
        "basis": "nominal asking rent; not effective rent or NOI",
        "vintage": "Q2 2020 report; release date unverified"
      },
      {
        "text": "PropertyShark reports a property sale on 2020-08-06. This does not verify the purchaser, founder ownership or CPP acquisition. Do not substitute this for a verified closing date in the investment reconstruction.",
        "url": "https://www.propertyshark.com/mason/Property/54068386/3060-State-St-Carlsbad-CA-92008/",
        "published": null,
        "event": "2020-08-06",
        "retrieved": "2026-11-09",
        "confidence": "Secondary property record; deed/purchaser not verified",
        "type": "reported sale date",
        "status": "reported, not ownership-verified",
        "geography": "Carlsbad Village, CA",
        "asset": "Retail",
        "units": "sale event date",
        "basis": "not applicable",
        "vintage": "retrieved 2026-11-09; original publication unknown"
      }
    ]
  },
  {
    "id": "synthetic",
    "name": "Fictional point-in-time demonstration",
    "kind": "Synthetic mechanics test, not a CPP deal",
    "acquired": "2021-06-30",
    "status": "All dates and figures in this case are invented for testing only",
    "claims": [
      {
        "text": "Fictional pre-purchase market note. Illustrates an observation published before the decision.",
        "url": "",
        "published": "2021-06-01",
        "event": "2021-03-31",
        "retrieved": "2026-11-09",
        "confidence": "Synthetic test fixture",
        "type": "market context",
        "status": "synthetic",
        "geography": "Fictional submarket",
        "asset": "Retail",
        "units": "qualitative claim",
        "basis": "not applicable",
        "vintage": "retrieved 2026-11-09; original vintage unverified"
      },
      {
        "text": "Fictional lease-up result. Must not appear in the acquisition-time information set.",
        "url": "",
        "published": "2022-08-15",
        "event": "2022-07-01",
        "retrieved": "2026-11-09",
        "confidence": "Synthetic test fixture",
        "type": "later outcome",
        "status": "synthetic",
        "geography": "Fictional submarket",
        "asset": "Retail",
        "units": "qualitative claim",
        "basis": "not applicable",
        "vintage": "retrieved 2026-11-09; original vintage unverified"
      },
      {
        "text": "Fictional revised historical statistic, published after purchase. Its old observation date does not make it knowable at purchase.",
        "url": "",
        "published": "2023-02-01",
        "event": "2020-12-31",
        "retrieved": "2026-11-09",
        "confidence": "Synthetic test fixture",
        "type": "revision leakage test",
        "status": "synthetic",
        "geography": "Fictional submarket",
        "asset": "Retail",
        "units": "qualitative claim",
        "basis": "not applicable",
        "vintage": "retrieved 2026-11-09; original vintage unverified"
      }
    ]
  }
];
