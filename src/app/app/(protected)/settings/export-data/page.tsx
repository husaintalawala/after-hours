import DataExportFlow from "@/components/app/settings/DataExportFlow"

// Download your data — the web half of iOS DataExportView. Its own page rather
// than a row that downloads on click, because what is in the file (and what is
// deliberately not: photo bytes, other people's private notes) is worth saying
// before anyone waits for it.
//
// No server work here: the protected layout is the auth gate, and everything
// this screen shows comes from the export-account preview.
export default function ExportDataPage() {
  return <DataExportFlow />
}
