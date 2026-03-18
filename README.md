# ZMV Abrechnungsservice — Time Tracker

Zeiterfassungs-Tool für den ZMV Abrechnungsservice von Patient 21 SE / dental::21.

## Features

- **Clock In / Clock Out** — Timer-basierte Zeiterfassung mit Kundenzuordnung
- **Screenshot-Erfassung** — Automatische Bildschirm-Screenshots alle 10 Minuten (einmalige Freigabe beim Clock-In)
- **Kundenverwaltung** — Vertragliche Stunden, Stundensätze und Zusatzstunden-Sätze pro Kunde
- **Abrechnung** — Automatische Berechnung von Vertrags- und Zusatzstunden mit Einzelnachweisen
- **Screenshot-Galerie** — Filterbar nach Kunde, exportierbar als Leistungsnachweis

## Voraussetzungen

- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Visual Studio 2022 (v17.8+) oder VS Code
- HTTPS erforderlich (Screen Capture API benötigt Secure Context)

## Projekt öffnen

1. `ZmvTimeTracker.sln` in Visual Studio öffnen
2. F5 drücken → Browser öffnet sich automatisch unter `https://localhost:5001`

## Alternativ via CLI

```bash
cd ZmvTimeTracker
dotnet run
```

Dann `https://localhost:5001` im Browser öffnen.

## Deployment

### Option A: IIS (Windows Server)

```bash
dotnet publish -c Release -o ./publish
```

Den Inhalt von `./publish` in den IIS-Ordner kopieren. Im IIS einen neuen Anwendungspool mit "No Managed Code" erstellen und die Seite darauf zeigen. HTTPS-Binding konfigurieren (Pflicht für Screenshot-Funktion).

### Option B: Azure App Service

```bash
dotnet publish -c Release
az webapp deploy --resource-group <rg> --name <app-name> --src-path ./publish
```

### Option C: Docker

```bash
docker build -t zmv-timetracker .
docker run -p 5001:8080 zmv-timetracker
```

## Projektstruktur

```
ZmvTimeTracker/
├── ZmvTimeTracker.sln          # Visual Studio Solution
├── ZmvTimeTracker.csproj       # Projektdatei (.NET 8)
├── Program.cs                  # ASP.NET Core Entry Point
├── Dockerfile                  # Container-Deployment
├── appsettings.json            # Konfiguration
├── Properties/
│   └── launchSettings.json     # Dev-Server Einstellungen
└── wwwroot/                    # Statische Frontend-Dateien
    ├── index.html              # Haupt-HTML
    ├── css/
    │   └── app.css             # Styles
    └── js/
        └── app.js              # Anwendungslogik
```

## Wichtige Hinweise

- **HTTPS ist Pflicht**: Die Screen Capture API (`getDisplayMedia`) funktioniert nur über HTTPS oder localhost
- **Bildschirmfreigabe**: Nutzer wählen beim Clock-In einmalig "Gesamter Bildschirm" — danach laufen Screenshots automatisch
- **Datenspeicherung**: Aktuell localStorage im Browser. Für Multi-User-Betrieb muss ein Backend mit Datenbank ergänzt werden
- **Browser-Kompatibilität**: Chrome/Edge empfohlen (beste Screen Capture API Unterstützung)

## Nächste Schritte (optional)

- [ ] Backend-API mit Datenbank (SQL Server / PostgreSQL) für persistente Datenhaltung
- [ ] Benutzer-Authentifizierung (Azure AD / Google Workspace SSO)
- [ ] PDF-Export für Monatsabrechnungen
- [ ] E-Mail-Benachrichtigung bei Überschreitung der Vertragsstunden
