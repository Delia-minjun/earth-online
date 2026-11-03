import { useTranslation } from "react-i18next";
import { Card, Empty } from "../components/Card";

export function PlaceholderView({ nameKey }: { nameKey: string }) {
  const { t } = useTranslation();
  return (
    <Card title={t(nameKey)}>
      <Empty text={t("placeholder.body")} hint={t("placeholder.hint")} />
    </Card>
  );
}
