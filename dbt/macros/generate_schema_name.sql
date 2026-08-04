{#
    Стандартний dbt override: без цього BigQuery-адаптер конкатенує
    custom_schema_name з дефолтним ("dbt_finance_operational" замість
    "dbt_operational"). З цим override — custom_schema, якщо заданий, стає
    датасетом як є; якщо не заданий (фінансові моделі) — лишається дефолтний
    таргет-датасет (dbt_finance), поведінка для них не змінюється.
#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {%- if custom_schema_name is none -%}
        {{ target.schema }}
    {%- else -%}
        {{ custom_schema_name | trim }}
    {%- endif -%}
{%- endmacro %}
