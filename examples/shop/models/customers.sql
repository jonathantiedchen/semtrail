{{ config(tags=['customers']) }}

select customer_id, segment
from {{ ref('raw_customers') }}
