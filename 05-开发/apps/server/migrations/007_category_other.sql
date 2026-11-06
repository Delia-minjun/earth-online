-- 时间块类别补一个「其他」，给那些一时归不了类的事
INSERT OR IGNORE INTO category (id, name, name_en, color, sort) VALUES
  ('cat-other', '其他', 'Other', '#CDBDB0', 6);
