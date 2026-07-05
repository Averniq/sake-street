-- First-pass Sake Street menu photo mapping.
-- Run this after deploying the /assets/menu-photos folder to Netlify.
-- You can adjust any dish later from Admin -> Photo URL.

with target_restaurant as (
  select id
  from public.restaurants
  where slug = 'sake-street'
  limit 1
),
photo_map(local_id, photo_url) as (
  values
    ('sake_miso_soup', '/assets/menu-photos/miso-soup.webp'),
    ('sake_kimchi', '/assets/menu-photos/kimchi.webp'),
    ('sake_seaweed_salad', '/assets/menu-photos/seaweed-salad.webp'),
    ('sake_wakame_salad', '/assets/menu-photos/seaweed-salad.webp'),
    ('sake_tofu_avocado_salad', '/assets/menu-photos/tofu-avocado-salad.webp'),
    ('sake_salmon_salad', '/assets/menu-photos/salmon-salad.webp'),
    ('sake_kingfish_carpaccio', '/assets/menu-photos/kingfish-carpaccio.webp'),
    ('sake_salmon_carpaccio', '/assets/menu-photos/salmon-sashimi.webp'),
    ('sake_tuna_tataki', '/assets/menu-photos/tuna-tataki.webp'),
    ('sake_edamame_salty', '/assets/menu-photos/edamame.webp'),
    ('sake_edamame_spicy', '/assets/menu-photos/spicy-edamame.webp'),
    ('sake_karaage_chicken', '/assets/menu-photos/karaage-chicken.webp'),
    ('sake_katsu_chicken', '/assets/menu-photos/katsu-chicken.webp'),
    ('sake_spicy_soft_shell_crab_hot', '/assets/menu-photos/soft-shell-crab.webp'),
    ('sake_pork_gyoza', '/assets/menu-photos/pork-gyoza.webp'),
    ('sake_miso_eggplant', '/assets/menu-photos/miso-eggplant.webp'),
    ('sake_salmon_rice_bowl', '/assets/menu-photos/salmon-rice-bowl.webp'),
    ('sake_dynamite_scallops', '/assets/menu-photos/dynamite-scallops.webp'),
    ('sake_tempura_white_fish', '/assets/menu-photos/tempura-white-fish.webp'),
    ('sake_tempura_veggies', '/assets/menu-photos/tempura-white-fish-2.webp'),
    ('sake_seared_salmon_belly', '/assets/menu-photos/salmon-sashimi.webp'),
    ('sake_seared_kingfish', '/assets/menu-photos/kingfish-sashimi.webp'),
    ('sake_kingfish_sashimi', '/assets/menu-photos/kingfish-sashimi.webp'),
    ('sake_salmon_ocean', '/assets/menu-photos/salmon-sashimi.webp'),
    ('sake_tuna_salmon_sashimi', '/assets/menu-photos/mixed-sashimi.webp'),
    ('sake_tuna_sashimi', '/assets/menu-photos/mixed-sashimi-2.webp'),
    ('sake_sashimi_ocean', '/assets/menu-photos/sashimi-platter.webp'),
    ('sake_mixed_sashimi', '/assets/menu-photos/mixed-sashimi-2.webp'),
    ('sake_salmon_nigiri', '/assets/menu-photos/salmon-nigiri.webp'),
    ('sake_kingfish_nigiri', '/assets/menu-photos/kingfish-nigiri.webp'),
    ('sake_tuna_nigiri', '/assets/menu-photos/tuna-nigiri.webp'),
    ('sake_aburi_salmon_nigiri', '/assets/menu-photos/salmon-nigiri.webp'),
    ('sake_aburi_kingfish_nigiri', '/assets/menu-photos/kingfish-nigiri.webp'),
    ('sake_aburi_scallop_nigiri', '/assets/menu-photos/nigiri-platter.webp'),
    ('sake_nigiri_platter', '/assets/menu-photos/nigiri-platter.webp'),
    ('sake_nigiri_sashimi_combo', '/assets/menu-photos/nigiri-platter-2.webp'),
    ('sake_maki_cucumber', '/assets/menu-photos/cucumber-maki.webp'),
    ('sake_maki_avocado', '/assets/menu-photos/cucumber-maki-2.webp'),
    ('sake_maki_teriyaki_chicken', '/assets/menu-photos/teriyaki-chicken-maki.webp'),
    ('sake_maki_salmon', '/assets/menu-photos/salmon-maki.webp'),
    ('sake_maki_cooked_tuna', '/assets/menu-photos/cooked-tuna-roll.webp'),
    ('sake_maki_fresh_tuna', '/assets/menu-photos/tuna-maki.webp'),
    ('sake_maki_egg', '/assets/menu-photos/egg-tamago-maki.webp'),
    ('sake_roll_vegetarian', '/assets/menu-photos/vegetarian-sushi-roll.webp'),
    ('sake_roll_cooked_tuna', '/assets/menu-photos/cooked-tuna-roll.webp'),
    ('sake_roll_chicken_schnitzel', '/assets/menu-photos/teriyaki-chicken-roll.webp'),
    ('sake_roll_teriyaki_chicken', '/assets/menu-photos/teriyaki-chicken-roll.webp'),
    ('sake_roll_fresh_salmon_deluxe', '/assets/menu-photos/fresh-salmon-deluxe-roll.webp'),
    ('sake_roll_seared_salmon', '/assets/menu-photos/fresh-salmon-deluxe-roll-2.webp'),
    ('sake_roll_fried_prawn', '/assets/menu-photos/fried-prawn-roll.webp'),
    ('sake_roll_spicy_soft_shell_crab', '/assets/menu-photos/soft-shell-crab.webp'),
    ('sake_roll_fresh_tuna', '/assets/menu-photos/sushi-roll.webp'),
    ('sake_roll_spicy_fresh_tuna_deluxe', '/assets/menu-photos/sushi-roll-2.webp'),
    ('sake_roll_california', '/assets/menu-photos/california-roll.webp'),
    ('sake_ramen_vegetable', '/assets/menu-photos/ramen.webp'),
    ('sake_ramen_karaage_chicken', '/assets/menu-photos/karaage-ramen.webp'),
    ('sake_ramen_pork_belly', '/assets/menu-photos/ramen.webp'),
    ('sake_ramen_seafood', '/assets/menu-photos/ramen.webp'),
    ('sake_stir_fried_vegetables', '/assets/menu-photos/stir-fried-vegetables.webp'),
    ('sake_teriyaki_chicken', '/assets/menu-photos/teriyaki-chicken-roll.webp'),
    ('sake_teriyaki_tasmanian_salmon', '/assets/menu-photos/salmon-rice-bowl-2.webp'),
    ('sake_teriyaki_kingfish', '/assets/menu-photos/kingfish-sashimi.webp'),
    ('sake_pork_bun', '/assets/menu-photos/pork-bun.webp')
)
update public.menu_items item
set photo_url = photo_map.photo_url
from target_restaurant, photo_map
where item.restaurant_id = target_restaurant.id
  and item.local_id = photo_map.local_id;
