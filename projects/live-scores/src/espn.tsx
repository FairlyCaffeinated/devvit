import { getLeagueFromString, getSportFromLeague, getSportFromLeagueString } from './sports.js';

export type GameEvent = {
  // events[].id
  id: string;
  // events[].name
  name: string;
  // events[].date
  date: string;
  homeTeam: TeamInfo;
  awayTeam: TeamInfo;
  // "Live" or "Final" events[].competitions[].status.type.detail (if this != “Final” its an ongoing game)
  state: EventState;
  // the sport name
  gameType: string;
  // the league (i.e. `mlb` or `nfl`)
  league: string;
  // Timing info (i.e. clock & period/quarter/half)
  timingInfo: GameEventTimingInfo;
};

export type GeneralGameScoreInfo = {
  event: GameEvent;
  // Events[].competitions[].competitors[].score
  homeScore: number;
  // Events[].competitions[].competitors[].score
  awayScore: number;
  // For example, "Bot 2" events[].competitions[].status.type.shortDetails
  extraContent: string;
};

export type GameEventTimingInfo = {
  clock: number;
  // Events[].competitions[].status.clock
  displayClock: string;
  // Events[].competitions[].status.clock
  period: number;
  // // Events[].competitions[].status.period
};

export interface BaseballGameScoreInfo extends GeneralGameScoreInfo {
  // events[].competitions[].situation.onFirst
  isRunnerOnFirst: boolean;
  // events[].competitions[].situation.onSecond
  isRunnerOnSecond: boolean;
  // events[].competitions[].situation.onThird
  isRunnerOnThird: boolean;
  // events[].competitions[].situation.balls
  balls: number;
  // events[].competitions[].situation.strikes
  strikes: number;
  // events[].competitions[].situation.outs
  outs: number;
  // events[].competitions[].situation.pitcher.athlete.displayName
  pitcher: string;
  // events[].competitions[].situation.batter.athlete.displayName
  batter: string;
  // events[].competitions[].situation.inning.number (TODO: parse real field)
  inning: number;
  // events[].competitions[].situation.inning.state (TODO: parse real field)
  inningState: InningState;
  // events[].competitions[].situation.dueUp[].athlete.displayName
  dueUp: string;
  // events[].competitions[].situation.pitcher.athlete.summary
  pitcherSummery: string;
  // events[].competitions[].situation.batter.athlete.summary
  batterSummary: string;
}

export type TeamInfo = {
  // events[].competitions[].competitors[].id
  id: string;
  // events[].competitions[].competitors[].team.shortDisplayName
  name: string;
  // events[].competitions[].competitors[].team.abbreviation
  abbreviation: string;
  // events[].competitions[].competitors[].team.displayName
  fullName: string;
  // events[].competitions[].competitors[].team.location
  location: string;
  // events[].competitions[].competitors[].team.logo
  logo: string;
  // team color
  color: string;
};

export enum EventState {
  UNKNOWN = '',
  PRE = 'pre',
  LIVE = 'live',
  FINAL = 'final',
  DELAYED = 'delayed',
}

export enum InningState {
  UNKNOWN = '',
  TOP = 'top',
  BOTTOM = 'bottom',
  MID = 'mid',
  END = 'end',
}

export async function fetchActiveGames<T extends GeneralGameScoreInfo>(
  league: string
): Promise<T[]> {
  const sport = getSportFromLeagueString(league);
  const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard`;
  let data;
  try {
    const request = new Request(apiUrl, {
      headers: { Accept: 'application/json' },
    });
    const res = await fetch(request);
    data = await res.json();
  } catch (e) {
    console.error(e);
    return [];
  }

  const gameInfos: T[] = [];
  data['events'].forEach((event: any) => {
    gameInfos.push(parseGeneralGameScoreInfo(event, league, sport) as T);
  });
  return gameInfos;
}

export async function fetchNextEventForTeam(teamId: string, league: string): Promise<GameEvent> {
  let data;
  const sport = getSportFromLeague(getLeagueFromString(league));
  try {
    const request = new Request(
      `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams/${teamId}`,
      {
        headers: { Accept: 'application/json' },
      }
    );
    const res = await fetch(request);
    data = await res.json();
  } catch (e) {
    console.error(e);
  }
  const event = data.team.nextEvent[0];
  const homeTeam = parseTeamInfo(
    league,
    event.competitions[0].competitors.find((team: any) => team.homeAway === 'home').team
  );
  const awayTeam = parseTeamInfo(
    league,
    event.competitions[0].competitors.find((team: any) => team.homeAway === 'away').team
  );
  const timing = parseTimingInfo(event.competitions[0].status);
  return {
    id: event.id,
    name: event.name,
    date: event.date,
    homeTeam: homeTeam,
    awayTeam: awayTeam,
    state: parseEventState(event),
    gameType: sport,
    league: league,
    timingInfo: timing,
  };
}

export async function fetchScoreForGame<T extends GeneralGameScoreInfo>(
  id: string,
  league: string
): Promise<T | null> {
  let data;
  const sport = getSportFromLeagueString(league);
  const apiUrl = `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard/${id}`;
  try {
    const request = new Request(apiUrl, {
      headers: { Accept: 'application/json' },
    });
    const res = await fetch(request);
    data = await res.json();
    return parseGeneralGameScoreInfo(data, league, sport) as T;
  } catch (e) {
    console.error(e);
  }
  return null;
}

export async function fetchAllTeams(league: string): Promise<TeamInfo[]> {
  let data;
  try {
    const sport = getSportFromLeagueString(league);
    const request = new Request(
      `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/teams`,
      {
        headers: { Accept: 'application/json' },
      }
    );
    const res = await fetch(request);
    data = await res.json();
  } catch (e) {
    console.error(e);
    return [];
  }
  const allTeams = data.sports[0].leagues[0].teams;
  return allTeams.map((team: any) => parseTeamInfo(league, team['team']));
}

function populateBaseballInfo(
  gameInfo: GeneralGameScoreInfo,
  competition: any
): BaseballGameScoreInfo {
  const baseballInfo: BaseballGameScoreInfo = {
    ...gameInfo,
    isRunnerOnFirst: false,
    isRunnerOnSecond: false,
    isRunnerOnThird: false,
    balls: 0,
    strikes: 0,
    outs: 0,
    pitcher: '',
    batter: '',
    inning: getInningFromString(competition.status.type.shortDetail),
    inningState: getInningStateFromString(competition.status.type.shortDetail),
    dueUp:
      competition.situation && competition.situation.dueUp
        ? competition.situation.dueUp[0].athlete.displayName
        : '',
    pitcherSummery: '',
    batterSummary: '',
  };

  // If game is in progress
  if (competition.status.type.name === 'STATUS_IN_PROGRESS' && competition.situation) {
    const situation = competition.situation;
    Object.assign(baseballInfo, {
      isRunnerOnFirst: Boolean(situation.onFirst),
      isRunnerOnSecond: Boolean(situation.onSecond),
      isRunnerOnThird: Boolean(situation.onThird),
      balls: situation.balls,
      strikes: situation.strikes,
      outs: situation.outs,
      pitcher: situation.pitcher?.athlete?.displayName || '',
      batter: situation.batter?.athlete?.displayName || '',
      pitcherSummery: situation.pitcher?.summary || '',
      batterSummary: situation.batter?.summary || '',
    });
  }

  return baseballInfo;
}

function parseGeneralGameScoreInfo(
  event: any,
  league: string,
  gameType: string
): GeneralGameScoreInfo | BaseballGameScoreInfo {
  const competition = event.competitions[0];
  const homeCompetitor = competition.competitors.find((team: any) => team.homeAway === 'home');
  const awayCompetitor = competition.competitors.find((team: any) => team.homeAway === 'away');
  const gameInfo: GeneralGameScoreInfo = {
    event: {
      id: event.id,
      name: event.name,
      date: event.date,
      homeTeam: parseTeamInfo(league, homeCompetitor.team),
      awayTeam: parseTeamInfo(league, awayCompetitor.team),
      state: parseEventState(event),
      gameType: gameType,
      league: league,
      timingInfo: competition.status,
    },
    homeScore: homeCompetitor.score,
    awayScore: awayCompetitor.score,
    extraContent: competition.status.type.shortDetail,
  };

  if (gameType.includes('baseball')) {
    return populateBaseballInfo(gameInfo, competition);
  }

  return gameInfo;
}

function parseTeamInfo(league: string, team: any): TeamInfo {
  const val: TeamInfo = {
    id: team['id'],
    name: team['shortDisplayName'],
    abbreviation: team['abbreviation'],
    fullName: team['displayName'],
    location: team['location'],
    logo: league + '-' + team['abbreviation'].toLowerCase() + '.png',
    color: '#' + team['color'],
  };
  return val;
}

function parseTimingInfo(status: any): GameEventTimingInfo {
  const val: GameEventTimingInfo = {
    clock: status['clock'],
    displayClock: status['displayClock'],
    period: status['period'],
  };
  return val;
}

function parseEventState(event: any): EventState {
  switch (event['competitions'][0]['status']['type']['name']) {
    case 'STATUS_SCHEDULED':
      return EventState.PRE;
    case 'STATUS_IN_PROGRESS':
      return EventState.LIVE;
    case 'STATUS_FINAL':
      return EventState.FINAL;
    case 'STATUS_DELAYED':
      return EventState.DELAYED;
    case 'STATUS_RAIN_DELAY':
      return EventState.DELAYED;
  }
  return EventState.UNKNOWN;
}

export function eventStateToString(state: EventState): string {
  switch (state) {
    case EventState.PRE:
      return 'Scheduled';
    case EventState.LIVE:
      return 'In Progress';
    case EventState.FINAL:
      return 'Final';
    case EventState.DELAYED:
      return 'Delayed';
    default:
      return '';
  }
}

export function eventPeriodToString(sport: string): string {
  switch (sport) {
    case 'football':
      return 'Quarter';
    case 'basketball':
      return 'Quarter';
    case 'hockey':
      return 'Period';
    case 'soccer':
      return 'Half';
    default:
      return 'Period';
  }
}

export function eventPeriodNumber(period: number): string {
  switch (period) {
    case 1:
      return '1st';
    case 2:
      return '2nd';
    case 3:
      return '3rd';
    case 4:
      return '4th';
    default:
      return `${period}`;
    // todo -> special case needed for overtime
  }
}

function getInningStateFromString(state: string): InningState {
  if (state.includes('Top')) return InningState.TOP;
  if (state.includes('Bot')) return InningState.BOTTOM;
  if (state.includes('End')) return InningState.END;
  if (state.includes('Mid')) return InningState.MID;
  return InningState.UNKNOWN;
}

function getInningFromString(str: string): number {
  const matches = str.match(/(\d+)/);
  return matches ? parseInt(matches[0]) : 0;
}