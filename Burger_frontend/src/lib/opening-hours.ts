import type { ClockTime, DayHours, IsoDate, OpeningHoursInfo, SpecialDate, Weekday } from '../services/api/types'

/**
 * Display helpers for the opening hours the API sends. Nothing here reads the visitor's
 * timezone: times arrive as "HH:MM" and dates as "YYYY-MM-DD" in Colombo time, and dates are
 * formatted as plain calendar dates (UTC-anchored) so they can't shift a day.
 */

export const DAY_NAME: Record<Weekday, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
}

export const DAY_SHORT: Record<Weekday, string> = {
  monday: 'Mon',
  tuesday: 'Tue',
  wednesday: 'Wed',
  thursday: 'Thu',
  friday: 'Fri',
  saturday: 'Sat',
  sunday: 'Sun',
}

/** "11:00" → "11 am", "22:30" → "10:30 pm", "00:00" and "23:59" → "midnight". */
export function formatTime(time: ClockTime | null): string {
  if (!time) return ''
  if (time === '00:00' || time === '23:59') return 'midnight'
  const [h, m] = time.split(':').map(Number)
  const hour = h % 12 === 0 ? 12 : h % 12
  return `${hour}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'am' : 'pm'}`
}

/** "11 am – 10:30 pm", or "Closed". */
export function formatRange(h: Pick<DayHours, 'closed' | 'open' | 'close'>): string {
  return h.closed ? 'Closed' : `${formatTime(h.open)} – ${formatTime(h.close)}`
}

function utcDate(date: IsoDate): Date {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** Adds whole days to a calendar date string. */
export function addDays(date: IsoDate, days: number): IsoDate {
  const d = utcDate(date)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dayMonthYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const weekdayDayMonth = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "25 Dec", with the year only when it isn't the current one. */
export function formatDate(date: IsoDate, today: IsoDate): string {
  return (date.slice(0, 4) === today.slice(0, 4) ? dayMonth : dayMonthYear).format(utcDate(date))
}

/** "Thu 25 Dec" */
export function formatWeekdayDate(date: IsoDate): string {
  return weekdayDayMonth.format(utcDate(date))
}

/** "25 Dec" or "24 – 26 Dec" */
export function formatDateRange(s: Pick<SpecialDate, 'starts_on' | 'ends_on'>, today: IsoDate): string {
  if (s.starts_on === s.ends_on) return formatWeekdayDate(s.starts_on)
  const sameMonth = s.starts_on.slice(0, 7) === s.ends_on.slice(0, 7)
  const start = sameMonth ? String(Number(s.starts_on.slice(8, 10))) : formatDate(s.starts_on, today)
  return `${start} – ${formatDate(s.ends_on, today)}`
}

/** "today", "tomorrow", "Wednesday" (within the week) or "Tue 1 Dec". */
export function relativeDay(date: IsoDate, day: Weekday, today: IsoDate): string {
  if (date === today) return 'today'
  if (date === addDays(today, 1)) return 'tomorrow'
  if (date <= addDays(today, 6)) return DAY_NAME[day]
  return formatWeekdayDate(date)
}

/** Consecutive days with the same hours, as "Monday – Thursday" (`short`: "Mon – Thu") / "11 am – 10:30 pm". */
export function groupWeek(weekly: DayHours[]): { days: string; short: string; time: string; members: Weekday[] }[] {
  const groups: { members: Weekday[]; time: string }[] = []
  for (const h of weekly) {
    const time = formatRange(h)
    const prev = groups[groups.length - 1]
    if (prev && prev.time === time) prev.members.push(h.day)
    else groups.push({ members: [h.day], time })
  }
  return groups.map(({ members, time }) => ({
    days: members.length === 1 ? DAY_NAME[members[0]] : `${DAY_NAME[members[0]]} – ${DAY_NAME[members[members.length - 1]]}`,
    // Single days stay whole ("Sunday"); only ranges are shortened.
    short: members.length === 1 ? DAY_NAME[members[0]] : `${DAY_SHORT[members[0]]} – ${DAY_SHORT[members[members.length - 1]]}`,
    time,
    members,
  }))
}

export interface StatusCopy {
  /** "Open now", "Closed now", "Closing soon", "Temporarily closed" */
  label: string
  /** "Until 10:30 pm", "Opens tomorrow at 11 am" */
  detail: string
  tone: 'open' | 'soon' | 'closed'
}

/** Customer-facing wording for the live status. */
export function statusCopy(info: Pick<OpeningHoursInfo, 'status' | 'today'>): StatusCopy {
  const { status, today } = info
  if (status.state === 'temporarily_closed') {
    return { label: 'Temporarily closed', detail: 'We’ll be back soon', tone: 'closed' }
  }
  if (status.state === 'open') {
    // closes_at is an instant; its Colombo wall-clock time is the "HH:MM" in the offset string.
    const close = status.closes_at ? formatTime(status.closes_at.slice(11, 16)) : ''
    const closesDate = status.closes_at?.slice(0, 10)
    const when = closesDate && closesDate !== today ? ` ${relativeDay(closesDate, weekdayOf(closesDate), today)}` : ''
    const until = close === 'midnight' && closesDate !== today ? 'Until midnight' : `Until ${close}${when}`
    return status.closing_soon
      ? { label: 'Closing soon', detail: `Closes at ${close}`, tone: 'soon' }
      : { label: 'Open now', detail: until, tone: 'open' }
  }
  const next = status.next_opening
  return {
    label: 'Closed now',
    detail: next ? `Opens ${relativeDay(next.date, next.day, today)} at ${formatTime(next.time)}` : 'Check back soon',
    tone: 'closed',
  }
}

const WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

function weekdayOf(date: IsoDate): Weekday {
  return WEEKDAYS[utcDate(date).getUTCDay()]
}
