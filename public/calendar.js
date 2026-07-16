// public/calendar.js — 农历 / 节气 / 节假日（基于 lunar-javascript 官方历法）
// 依赖前置加载的 /vendor/lunar.js（UMD，浏览器下挂全局 Solar/Lunar）。
// 之所以不用 Intl('zh-CN-u-ca-chinese')：ICU 自带朔望计算与紫金山官方标准在部分年份
// （如 2027、2030 春节）会差 1 天，且闰月返回 "闰5" 字符串需特殊处理；lunar-javascript
// 实现官方历法，经 2026-2031 春节/除夕/闰月/节气逐一验证，全部正确。
(function () {
  function lunarOf(date) {
    const lunar = Solar.fromDate(date).getLunar();
    return {
      month: lunar.getMonth(),
      day: lunar.getDay(),
      text: lunar.getMonthInChinese() + '月' + lunar.getDayInChinese()
    };
  }

  function holidayOf(date) {
    const solar = Solar.fromDate(date);
    const lunar = solar.getLunar();
    const list = []
      .concat(solar.getFestivals(), lunar.getFestivals(), lunar.getOtherFestivals());
    return list.length ? list[0] : null;
  }

  function termInfo(date) {
    const lunar = Solar.fromDate(date).getLunar();
    const today = lunar.getJieQi();
    if (today) return { today, next: null };

    const next = lunar.getNextJieQi();
    if (!next) return { today: null, next: null };
    const ns = next.getSolar();
    const nextMs = Date.UTC(ns.getYear(), ns.getMonth() - 1, ns.getDay());
    const todayMs = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const inDays = Math.round((nextMs - todayMs) / 86400000);
    return { today: null, next: { name: next.getName(), month: ns.getMonth(), day: ns.getDay(), inDays } };
  }

  const root = typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this);
  root.HomeCalendar = { lunarOf, holidayOf, termInfo };
})();
