/* eslint-disable jsx-a11y/alt-text */
import React from "react"
import {
  Document,
  Page,
  View,
  Text,
  Image,
  Svg,
  Defs,
  LinearGradient,
  Stop,
  Rect,
  Path,
  Circle,
  StyleSheet,
} from "@react-pdf/renderer"
import type {
  ItineraryDocumentModel,
  ItineraryDay,
  ItineraryItem,
  ItinerarySection,
} from "./itinerary"
import { itineraryFonts } from "./fonts"
import { DRIFT_MARK_PNG, DRIFT_MARK_ASPECT } from "./logo"

// The itinerary as paper — the web twin of iOS `ItineraryPDFRenderer`, drawn to
// the same spec so a plan exported from either client looks like the same
// document.
//
// Deliberately theme-INVARIANT: every colour below is a fixed literal, never an
// Aurora token. This is a share artifact; it must not carry whichever theme the
// exporting browser happened to be in.
//
// Pagination is react-pdf's own flow rather than iOS's block packer: cards are
// `wrap={false}` so one never splits across a page, and headers carry
// `minPresenceAhead` so a destination or day title can't strand itself at the
// foot of a page with nothing under it.

const PAGE_W = 612 // US Letter
const PAGE_H = 792
const MARGIN = 54
const CONTENT_W = PAGE_W - MARGIN * 2 // 504
const BAND_H = 424

// ------------------------------------------------------------ paper palette --

const Paper = {
  sheet: "#FFFFFF",
  ink: "#12181A",
  ink2: "#5B6669",
  ink3: "#909B9E",
  hairline: "#E5E9EA",
  wash: "#F5F7F7",
  teal: "#0E8578", // Aurora teal, darkened for small text on white
  tealBright: "#1FB59A",
  indigo: "#5B4EDA",
  onDark: "#FFFFFF",
  stayWash: "#F8F5FE",
  stayBorder: "#E8E0F8",
  scrim: "#05100F",
}

export function itineraryStyles(serif: string, sans: string) {
  return StyleSheet.create({
    coverPage: { backgroundColor: Paper.sheet },
    page: {
      backgroundColor: Paper.sheet,
      paddingTop: 92,
      paddingBottom: 58,
      paddingHorizontal: MARGIN,
    },

    // ---- cover ----
    band: { position: "relative", width: PAGE_W, height: BAND_H },
    bandFill: { position: "absolute", top: 0, left: 0, width: PAGE_W, height: BAND_H },
    bandTop: {
      position: "absolute",
      top: 38,
      left: MARGIN,
      width: CONTENT_W,
      flexDirection: "row",
      alignItems: "center",
    },
    wordmark: { flexDirection: "row", alignItems: "center" },
    markCover: { width: 22, height: 22 / DRIFT_MARK_ASPECT, marginRight: 7 },
    driftWord: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 11,
      letterSpacing: 3.4,
      color: Paper.onDark,
    },
    kicker: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 9,
      letterSpacing: 4,
      color: Paper.onDark,
      opacity: 0.82,
      marginLeft: "auto",
    },
    bandBottom: { position: "absolute", bottom: 34, left: MARGIN, width: CONTENT_W },
    destLine: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 9.5,
      letterSpacing: 3.2,
      color: Paper.tealBright,
      marginBottom: 10,
      maxLines: 1,
      textOverflow: "ellipsis",
    },
    coverTitle: {
      fontFamily: serif,
      fontWeight: 600,
      fontSize: 40,
      lineHeight: 1.12,
      color: Paper.onDark,
      maxLines: 3,
      textOverflow: "ellipsis",
    },
    coverCredit: {
      position: "absolute",
      bottom: 12,
      right: MARGIN,
      fontFamily: sans,
      fontSize: 6.5,
      letterSpacing: 0.4,
      color: Paper.onDark,
      opacity: 0.55,
      maxLines: 1,
    },
    coverBody: { paddingHorizontal: MARGIN, paddingTop: 30 },
    coverRange: { fontFamily: serif, fontWeight: 600, fontSize: 17, color: Paper.ink },

    statBand: {
      marginTop: 26,
      flexDirection: "row",
      alignItems: "stretch",
      backgroundColor: Paper.wash,
      borderWidth: 1,
      borderColor: Paper.hairline,
      borderRadius: 16,
      paddingVertical: 20,
      paddingHorizontal: 22,
    },
    statCell: { flexGrow: 1, flexBasis: 0 },
    statLabel: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 8.5,
      letterSpacing: 1.9,
      color: Paper.ink3,
      marginBottom: 7,
    },
    statValue: { fontFamily: serif, fontWeight: 600, fontSize: 21, color: Paper.ink },
    statDivider: {
      width: 1,
      backgroundColor: Paper.hairline,
      marginHorizontal: 9,
    },

    // ---- running head / footer ----
    head: {
      position: "absolute",
      top: 48,
      left: MARGIN,
      width: CONTENT_W,
    },
    headRow: { flexDirection: "row", alignItems: "flex-end" },
    headTitle: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 8.5,
      letterSpacing: 2.2,
      color: Paper.ink3,
      maxLines: 1,
      textOverflow: "ellipsis",
      flexShrink: 1,
    },
    headRange: {
      fontFamily: sans,
      fontSize: 8.5,
      letterSpacing: 0.6,
      color: Paper.ink3,
      marginLeft: "auto",
      paddingLeft: 16,
      maxLines: 1,
    },
    headRule: { marginTop: 12, height: 1, backgroundColor: Paper.hairline },

    footer: {
      position: "absolute",
      bottom: 30,
      left: MARGIN,
      width: CONTENT_W,
    },
    footerRule: { height: 1, backgroundColor: Paper.hairline, marginBottom: 10 },
    footerRow: { flexDirection: "row", alignItems: "center" },
    markFooter: { width: 14, height: 14 / DRIFT_MARK_ASPECT, marginRight: 7 },
    footerText: {
      fontFamily: sans,
      fontSize: 8.5,
      letterSpacing: 0.8,
      color: Paper.ink3,
    },
    pageNo: {
      fontFamily: sans,
      fontSize: 8.5,
      letterSpacing: 0.8,
      color: Paper.ink3,
      marginLeft: "auto",
    },

    // ---- section / day ----
    section: { marginTop: 22 },
    sectionFirst: { marginTop: 0 },
    sectionHeadRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    sectionIndex: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 10,
      letterSpacing: 1.4,
      color: Paper.teal,
      backgroundColor: "#E4F5F1",
      borderRadius: 6,
      paddingVertical: 4,
      paddingHorizontal: 7,
      marginRight: 10,
    },
    sectionName: {
      fontFamily: serif,
      fontWeight: 600,
      fontSize: 25,
      color: Paper.ink,
      maxLines: 1,
      textOverflow: "ellipsis",
      flexShrink: 1,
    },
    sectionMeta: {
      fontFamily: sans,
      fontSize: 10,
      color: Paper.ink2,
      marginBottom: 14,
      maxLines: 1,
      textOverflow: "ellipsis",
    },

    dayRow: { flexDirection: "row", alignItems: "center", marginTop: 14, marginBottom: 8 },
    dayLabel: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 9,
      letterSpacing: 1.8,
      color: Paper.teal,
      marginRight: 10,
    },
    dayDate: {
      fontFamily: sans,
      fontSize: 9.5,
      letterSpacing: 0.4,
      color: Paper.ink3,
      marginRight: 10,
    },
    dayRule: { flexGrow: 1, height: 1, backgroundColor: Paper.hairline },

    emptyDay: {
      fontFamily: serif,
      fontWeight: 600,
      fontStyle: "italic",
      fontSize: 11,
      color: Paper.ink3,
      marginBottom: 6,
      paddingLeft: 2,
    },
    note: {
      fontFamily: serif,
      fontWeight: 600,
      fontStyle: "italic",
      fontSize: 12.5,
      color: Paper.ink2,
      backgroundColor: Paper.wash,
      borderRadius: 12,
      paddingVertical: 18,
      paddingHorizontal: 18,
      marginTop: 18,
      lineHeight: 1.45,
    },

    // ---- item card ----
    card: {
      borderWidth: 1,
      borderColor: Paper.hairline,
      borderRadius: 12,
      backgroundColor: Paper.sheet,
      paddingVertical: 13,
      paddingHorizontal: 14,
      marginBottom: 10,
    },
    cardTinted: { backgroundColor: Paper.stayWash, borderColor: Paper.stayBorder },
    cardTopRow: { flexDirection: "row", alignItems: "center", marginBottom: 9 },
    pill: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 8,
      letterSpacing: 1.4,
      borderRadius: 9,
      paddingTop: 4.5,
      paddingBottom: 3.5,
      paddingHorizontal: 8,
    },
    time: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 9.5,
      letterSpacing: 0.3,
      marginLeft: "auto",
      paddingLeft: 8,
      maxLines: 1,
    },
    cardTitle: {
      fontFamily: serif,
      fontWeight: 600,
      fontSize: 15,
      color: Paper.ink,
      maxLines: 2,
      textOverflow: "ellipsis",
      lineHeight: 1.25,
    },
    addressRow: { flexDirection: "row", alignItems: "flex-start", marginTop: 4 },
    addressText: {
      fontFamily: sans,
      fontSize: 9,
      color: Paper.ink2,
      maxLines: 1,
      textOverflow: "ellipsis",
      flexShrink: 1,
    },
    summary: {
      fontFamily: sans,
      fontSize: 9.5,
      color: Paper.ink2,
      lineHeight: 1.45,
      marginTop: 5,
      maxLines: 3,
      textOverflow: "ellipsis",
    },
    bookingRule: {
      marginTop: 11,
      borderTopWidth: 1,
      borderTopColor: Paper.hairline,
      borderStyle: "dashed",
    },
    bookingLine: {
      fontFamily: sans,
      fontWeight: 700,
      fontSize: 9,
      letterSpacing: 0.3,
      marginTop: 9,
      maxLines: 1,
      textOverflow: "ellipsis",
    },
  })
}

type Styles = ReturnType<typeof itineraryStyles>

// -------------------------------------------------------------- components --

/** A map pin, drawn rather than typed — the built-in faces carry no pin glyph
 *  and a Unicode 📍 would need an emoji font in the lambda. */
function PinIcon() {
  return (
    <Svg width={7} height={8.75} viewBox="0 0 8 10" style={{ marginTop: 1.6, marginRight: 5 }}>
      <Path
        d="M4 0C1.79 0 0 1.79 0 4c0 3 4 6 4 6s4-3 4-6c0-2.21-1.79-4-4-4z"
        fill={Paper.ink3}
      />
      <Circle cx={4} cy={3.9} r={1.45} fill={Paper.sheet} />
    </Svg>
  )
}

function CoverBand({
  s,
  doc,
}: {
  s: Styles
  doc: ItineraryDocumentModel
}) {
  return (
    <View style={s.band}>
      {doc.coverDataUri ? (
        <Image
          src={doc.coverDataUri}
          style={{ ...s.bandFill, objectFit: "cover" }}
        />
      ) : (
        <Svg style={s.bandFill} width={PAGE_W} height={BAND_H}>
          <Defs>
            <LinearGradient id="brand" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={Paper.tealBright} />
              <Stop offset="1" stopColor={Paper.indigo} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={PAGE_W} height={BAND_H} fill="url(#brand)" />
        </Svg>
      )}

      {/* Legibility scrim — the title has to survive any photo under it. */}
      <Svg style={s.bandFill} width={PAGE_W} height={BAND_H}>
        <Defs>
          <LinearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={Paper.scrim} stopOpacity={0} />
            <Stop offset="0.55" stopColor={Paper.scrim} stopOpacity={0.45} />
            <Stop offset="1" stopColor={Paper.scrim} stopOpacity={0.9} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={PAGE_W} height={BAND_H} fill="url(#scrim)" />
      </Svg>

      <View style={s.bandTop}>
        <View style={s.wordmark}>
          <Image src={DRIFT_MARK_PNG} style={s.markCover} />
          <Text style={s.driftWord}>DRIFT</Text>
        </View>
        <Text style={s.kicker}>TRIP ITINERARY</Text>
      </View>

      <View style={s.bandBottom}>
        <Text style={s.destLine}>{doc.destinationsLine}</Text>
        <Text style={s.coverTitle}>{doc.title}</Text>
      </View>

      {/* Sourced-stock covers carry their photographer credit. Non-negotiable. */}
      {doc.coverCredit && <Text style={s.coverCredit}>{doc.coverCredit}</Text>}
    </View>
  )
}

function StatBand({ s, doc }: { s: Styles; doc: ItineraryDocumentModel }) {
  if (!doc.stats.length) return null
  return (
    <View style={s.statBand}>
      {doc.stats.map((stat, i) => (
        <React.Fragment key={stat.label}>
          <View style={s.statCell}>
            <Text style={s.statLabel}>{stat.label.toUpperCase()}</Text>
            <Text style={s.statValue}>{stat.value}</Text>
          </View>
          {i < doc.stats.length - 1 && <View style={s.statDivider} />}
        </React.Fragment>
      ))}
    </View>
  )
}

function Footer({ s, rule }: { s: Styles; rule: boolean }) {
  return (
    <View style={s.footer} fixed>
      {rule && <View style={s.footerRule} />}
      <View style={s.footerRow}>
        <Image src={DRIFT_MARK_PNG} style={s.markFooter} />
        <Text style={s.footerText}>Made with Drift</Text>
        <Text
          style={s.pageNo}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </View>
  )
}

function ItemCard({ s, item }: { s: Styles; item: ItineraryItem }) {
  return (
    <View style={item.tinted ? [s.card, s.cardTinted] : s.card} wrap={false}>
      <View style={s.cardTopRow}>
        <Text style={[s.pill, { backgroundColor: item.tag.bg, color: item.tag.fg }]}>
          {item.tag.label}
        </Text>
        <Text
          style={[s.time, { color: item.timeText === "—" ? Paper.ink3 : Paper.ink2 }]}
        >
          {item.timeText}
        </Text>
      </View>

      <Text style={s.cardTitle}>{item.title}</Text>

      {item.address && (
        <View style={s.addressRow}>
          <PinIcon />
          <Text style={s.addressText}>{item.address}</Text>
        </View>
      )}

      {item.summary && <Text style={s.summary}>{item.summary}</Text>}

      {item.booking && (
        <>
          <View style={s.bookingRule} />
          <Text style={[s.bookingLine, { color: item.tag.fg }]}>{item.booking}</Text>
        </>
      )}
    </View>
  )
}

/** A day header glued to whatever opens the day. Kept as its own unwrappable
 *  group so a "DAY 3 · Wed, Jul 8" rule can never strand itself at the foot of
 *  a page with its first card overleaf — the widow guard iOS spells out in its
 *  paginator, expressed here as `wrap={false}`. */
function DayOpen({ s, day }: { s: Styles; day: ItineraryDay }) {
  return (
    <View wrap={false}>
      <View style={s.dayRow}>
        <Text style={s.dayLabel}>{day.label.toUpperCase()}</Text>
        <Text style={s.dayDate}>{day.dateText}</Text>
        <View style={s.dayRule} />
      </View>
      {day.items.length === 0 ? (
        <Text style={s.emptyDay}>Open day — nothing planned yet</Text>
      ) : (
        <ItemCard s={s} item={day.items[0]} />
      )}
    </View>
  )
}

function DayRest({ s, day }: { s: Styles; day: ItineraryDay }) {
  return (
    <>
      {day.items.slice(1).map((item) => (
        <ItemCard key={item.id} s={s} item={item} />
      ))}
    </>
  )
}

function Section({
  s,
  section,
  first,
}: {
  s: Styles
  section: ItinerarySection
  first: boolean
}) {
  const [firstDay, ...restDays] = section.days
  return (
    <View style={first ? s.sectionFirst : s.section}>
      {/* Destination title, its meta line and the opening day travel together. */}
      <View wrap={false}>
        <View style={s.sectionHeadRow}>
          {section.index != null && (
            <Text style={s.sectionIndex}>
              {String(section.index).padStart(2, "0")}
            </Text>
          )}
          <Text style={s.sectionName}>{section.name}</Text>
        </View>
        <Text style={s.sectionMeta}>{section.meta}</Text>
        {firstDay && <DayOpen s={s} day={firstDay} />}
      </View>
      {firstDay && <DayRest s={s} day={firstDay} />}

      {restDays.map((day) => (
        <View key={`${section.name}-${day.label}-${day.dateText}`}>
          <DayOpen s={s} day={day} />
          <DayRest s={s} day={day} />
        </View>
      ))}
    </View>
  )
}

// ---------------------------------------------------------------- document --

export function ItineraryPdf({ doc }: { doc: ItineraryDocumentModel }) {
  const { serif, sans } = itineraryFonts()
  const s = itineraryStyles(serif, sans)

  return (
    <Document title={`${doc.title} — Itinerary`} author="Drift" creator="Drift">
      <Page size="LETTER" style={s.coverPage}>
        <CoverBand s={s} doc={doc} />
        <View style={s.coverBody}>
          <Text style={s.coverRange}>{doc.dateRangeText}</Text>
          <StatBand s={s} doc={doc} />
        </View>
        <Footer s={s} rule={false} />
      </Page>

      <Page size="LETTER" style={s.page}>
        <View style={s.head} fixed>
          <View style={s.headRow}>
            <Text style={s.headTitle}>{doc.title.toUpperCase()}</Text>
            <Text style={s.headRange}>{doc.dateRangeText}</Text>
          </View>
          <View style={s.headRule} />
        </View>

        {doc.sections.map((section, i) => (
          <Section key={`${section.name}-${i}`} s={s} section={section} first={i === 0} />
        ))}

        {doc.emptyNote && <Text style={s.note}>{doc.emptyNote}</Text>}

        <Footer s={s} rule />
      </Page>
    </Document>
  )
}
