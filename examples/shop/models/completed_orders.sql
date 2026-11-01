{{ config(tags=['finance']) }}

select order_id, country, amount, ordered_at
from {{ ref('raw_orders') }}
where status = 'completed'
