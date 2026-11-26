# ============================================================
#  서버가 보내는 문구 표 (한국어/영어) — api/ 안의 _ 파일 = Vercel 엔드포인트 아님
#  scripts/i18n/gen_i18n.py 가 strings_ko.md · strings_en.md 에서 만든다. 번호 = strings_ko.md 의 번호.
#  lang 이 en 이 아니면 지금까지와 같은 한국어가 나간다.
# ============================================================
import re

KO = {216: '국내선물', 217: '나스닥 선물', 223: '환경변수 미설정 (LS_APP_KEY/LS_APP_SECRET)', 224: "토큰 발급 실패: {str(j.get('error_description') or j.get('error') or j)}", 225: '종목코드를 입력하세요', 226: '국내는 6자리 코드, 해외는 영문 티커(AAPL 등)', 227: '아직 차트를 분석할 만큼 봉(캔들)이 형성되지 않았어요. {nm}은(는) 상장 초기이거나 거래가 매우 적은 종목으로 보여요.\n\n차트 분석에는 봉이 일정 수 이상 쌓여야 해요:\n· 단기(15분봉): 약 2~3거래일 필요\n· 중기(60분봉): 약 1~2주 필요\n· 중장기(일봉): 약 30거래일 필요\n\n현재 형성된 봉 — 일봉 {str(_nd)}개 / 60분봉 {str(_n60)}개 / 15분봉 {str(_n10)}개\n봉이 더 쌓이면 단기부터 순차적으로 분석할 수 있어요. 며칠 후 다시 확인해 주세요.', 228: '분석 실패: {str(ex)}', 229: 'LS 응답 오류 (HTTP %s)', 230: 'LS 오류', 231: '야후 %s 응답 없음', 232: '선물 최근월물을 찾지 못했습니다', 233: '선물 최근월물 또는 위클리옵션 코드가 아닙니다', 234: '종목코드가 없습니다', 235: '조회 실패: {str(e)[:200]}'}

EN = {216: 'KOSPI 200 futures', 217: 'Nasdaq futures', 223: 'Server configuration error', 224: 'Data provider error', 225: 'Enter a ticker', 226: 'Use a ticker symbol (e.g. AAPL), a 6-digit code for Korean stocks, or a 4-digit code for Japanese stocks', 227: 'Not enough bars (candles) have formed to analyze this chart yet. {nm} appears to be newly listed or very thinly traded.\n\nChart analysis needs a minimum number of bars:\n· Short-term (15-min): about 2–3 trading days\n· Mid-term (60-min): about 1–2 weeks\n· Long-term (daily): about 30 trading days\n\nBars so far — daily {str(_nd)} / 60-min {str(_n60)} / 15-min {str(_n10)}\nAs more bars form, analysis becomes available starting with the short term. Please check back in a few days.', 228: 'Analysis failed: {str(ex)}', 229: 'Data provider error (HTTP %s)', 230: 'Data provider error', 231: 'No response for %s', 232: 'Front-month futures contract not found', 233: 'Not a supported futures code', 234: 'No ticker provided', 235: 'Request failed: {str(e)[:200]}'}

def lang_of(qs):
    """쿼리의 lang → 'en' 또는 'ko'"""
    return 'en' if ((qs.get('lang', [''])[0] or '').strip().lower() == 'en') else 'ko'

def t(n, lang, *vals):
    """번호 n 의 문구. 끼워 넣는 자리({…}, %s)는 vals 로 순서대로 채운다"""
    s = (EN.get(n) if lang == 'en' else None) or KO[n]
    it = iter(vals)
    return re.sub(r'\{[^}]*\}|%s', lambda m: str(next(it, '')), s)

class Msg(Exception):
    """문구 번호를 가진 예외. str() 은 한국어(기존 글과 같음)"""
    def __init__(self, n, *vals):
        self.n = n; self.vals = vals; super().__init__(t(n, 'ko', *vals))

def text(ex, lang):
    """예외 글: 번호가 있으면 그 언어의 문구, 없으면 str(ex)"""
    return t(ex.n, lang, *ex.vals) if (isinstance(ex, Msg) and ex.n is not None) else str(ex)
