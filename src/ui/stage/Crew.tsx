import { assetUrl } from '../../data/release';

/**
 * The Artemis III crew, as named by NASA on 9 June 2026 (news release 26-048). Facts are from
 * that release and the agencies' biographies; portraits are crops of NASA's official crew photo
 * (NASA/Bill Stafford). Shown for context only: no endorsement by NASA or ESA is implied.
 */
const SOURCE = 'https://www.nasa.gov/news-release/nasa-marches-toward-artemis-iii-mission-in-2027-names-crew-members/';

interface Member {
  id: string;
  name: string;
  role: string;
  agency: 'NASA' | 'ESA';
  flight: string;
  since: string;
  info: string;
}

const CREW: Member[] = [
  {
    id: 'bresnik',
    name: 'Randy Bresnik',
    role: 'Commander',
    agency: 'NASA',
    flight: '3rd spaceflight',
    since: 'astronaut since 2004',
    info: 'Flew on space shuttle mission STS-129 and commanded Expedition 53 on the International Space Station. Retired U.S. Marine Corps colonel with more than 7,000 flight hours.',
  },
  {
    id: 'parmitano',
    name: 'Luca Parmitano',
    role: 'Pilot',
    agency: 'ESA',
    flight: '3rd spaceflight',
    since: 'astronaut since 2009',
    info: 'First Italian to command the International Space Station, on Expedition 61. Italian Air Force colonel and test pilot with 366 days in space.',
  },
  {
    id: 'douglas',
    name: 'Andre Douglas',
    role: 'Mission specialist',
    agency: 'NASA',
    flight: '1st spaceflight',
    since: 'astronaut since 2021',
    info: 'Backup crew member for Artemis II. U.S. Coast Guard Academy graduate with a doctorate in systems engineering.',
  },
  {
    id: 'rubio',
    name: 'Frank Rubio',
    role: 'Mission specialist',
    agency: 'NASA',
    flight: '2nd spaceflight',
    since: 'astronaut since 2017',
    info: 'Spent 371 days on the International Space Station in 2022–2023, the longest single spaceflight by a U.S. astronaut. U.S. Army aviator and physician.',
  },
];

export function CrewPanel() {
  return (
    <div className="crew">
      <p className="drawer__lede">
        NASA named this crew on 9 June 2026. In 2027 they will fly Orion to low Earth orbit for about two weeks and practise
        meeting and docking with test versions of the Blue Moon and Starship landers.
      </p>
      <ul className="crew__list">
        {CREW.map((m) => (
          <li key={m.id} className="crew-card">
            <img
              className="crew-card__photo"
              src={assetUrl(`img/crew/${m.id}.webp`)}
              alt={`${m.name} in an orange Orion crew suit`}
              width={480}
              height={480}
              loading="lazy"
              decoding="async"
            />
            <div className="crew-card__text">
              <p className="crew-card__role">
                {m.role}
                <span className={`crew-card__agency crew-card__agency--${m.agency.toLowerCase()}`}>{m.agency}</span>
              </p>
              <h3 className="crew-card__name">{m.name}</h3>
              <p className="crew-card__meta">
                {m.flight} <span aria-hidden="true">·</span> <span className="crew-card__since">{m.since}</span>
              </p>
              <p className="crew-card__info">{m.info}</p>
            </div>
          </li>
        ))}
      </ul>
      <p className="crew__backup">
        Backup crew member: <strong>Bob Hines</strong>, NASA.
      </p>
      <section className="crew__note" aria-label="How this crew relates to LunaNav">
        <h3 className="crew__note-head">Artemis III does not land on the Moon</h3>
        <p>
          The nine regions in LunaNav were announced by NASA in October 2024 as candidates for an Artemis III landing. NASA has
          since made Artemis III an Earth-orbit test. The first crewed landing near the south pole is now planned for Artemis IV
          in 2028, and its crew has not been named.
        </p>
      </section>
      <p className="crew__credit">
        Portraits cropped from the official crew photo, NASA/Bill Stafford. Crew details from the{' '}
        <a href={SOURCE} target="_blank" rel="noreferrer">
          NASA news release of 9 June 2026
        </a>
        . LunaNav is an independent student project. NASA and ESA do not endorse it.
      </p>
    </div>
  );
}
