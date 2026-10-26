-- Reference data only. No laundries, prices or orders are seeded:
-- partners register and price their own services.

insert into public.cities (slug, name_ar, name_ur, lat, lng, sort_order) values
  ('dammam',  'الدمام',  'دمام',   26.4207, 50.0888, 1),
  ('khobar',  'الخبر',   'الخبر',  26.2172, 50.1971, 2),
  ('dhahran', 'الظهران', 'ظہران',  26.2361, 50.0393, 3),
  ('qatif',   'القطيف',  'قطیف',   26.5196, 50.0115, 4),
  ('riyadh',  'الرياض',  'ریاض',   24.7136, 46.6753, 5),
  ('jeddah',  'جدة',     'جدہ',    21.4858, 39.1925, 6)
on conflict (slug) do nothing;

insert into public.service_categories (slug, name_ar, name_ur, icon, sort_order) values
  ('wash',        'غسيل ملابس',            'کپڑوں کی دھلائی',         'shirt',    1),
  ('wash_iron',   'غسيل وكي',              'دھلائی اور استری',        'iron',     2),
  ('iron',        'كي فقط',                'صرف استری',               'iron',     3),
  ('thobe',       'ثياب',                  'توب',                     'thobe',    4),
  ('abaya',       'عبايات',                'عبایا',                   'abaya',    5),
  ('shirts',      'قمصان وبناطيل',         'شرٹس اور پتلون',          'shirt',    6),
  ('suits',       'بدل وملابس حساسة',      'سوٹ اور نازک کپڑے',       'suit',     7),
  ('blankets',    'بطانيات ولحف',          'کمبل اور رضائیاں',        'blanket',  8),
  ('curtains',    'ستائر',                 'پردے',                    'curtain',  9),
  ('household',   'مفروشات منزلية',        'گھریلو کپڑے',             'home',    10),
  ('express',     'خدمة مستعجلة',          'فوری سروس',               'bolt',    11),
  ('other',       'خدمات أخرى',            'دیگر خدمات',              'sparkle', 12)
on conflict (slug) do nothing;
