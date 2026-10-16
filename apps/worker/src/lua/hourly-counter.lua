-- hourly-counter.lua
-- KEYS[1] = rate limit key, e.g. "rl:{senderId}:{yyyyMMddHH}"
-- ARGV[1] = hourly limit (max allowed)
-- Returns: {allowed (0|1), current_count}

local key = KEYS[1]
local limit = tonumber(ARGV[1])

local current = redis.call('INCR', key)

-- On first increment, set TTL to 2 hours so the key auto-expires
if current == 1 then
  redis.call('EXPIRE', key, 7200)
end

if current <= limit then
  return {1, current}
else
  -- Roll back the increment — this send will not happen
  redis.call('DECR', key)
  return {0, current - 1}
end
