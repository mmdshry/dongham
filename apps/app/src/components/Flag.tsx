import { flagCdnUrl, flagEmojiToIso2 } from '../lib/flagIso';
import type { CurrencyInfo } from '../lib/currencyCatalog';

export function Flag({
  flag,
  alt = '',
  className = '',
}: {
  flag: string;
  alt?: string;
  className?: string;
}) {
  const iso2 = flagEmojiToIso2(flag);
  if (!iso2) {
    return (
      <span className={`inline-flex h-4 w-5 items-center justify-center text-sm leading-none ${className}`} aria-hidden>
        {flag}
      </span>
    );
  }
  return (
    <img
      src={flagCdnUrl(iso2, 40)}
      srcSet={`${flagCdnUrl(iso2, 80)} 2x`}
      width={20}
      height={15}
      alt={alt}
      className={`inline-block h-4 w-5 shrink-0 rounded-sm object-cover ${className}`}
      loading="lazy"
    />
  );
}

export function CurrencyMark({ info }: { info: Pick<CurrencyInfo, 'flag' | 'nameFa' | 'code'> }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Flag flag={info.flag} alt="" />
      <span>
        {info.nameFa} · {info.code}
      </span>
    </span>
  );
}
