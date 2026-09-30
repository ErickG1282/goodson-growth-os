export type CustomFoodServing={serving_quantity:number;serving_grams:number|null;protein_g:number;carbohydrates_g:number;fat_g:number;calories:number}

export function customFoodServingSnapshot(food:CustomFoodServing,multiplier:number){
  return{
    servingAmount:Number(food.serving_quantity)*multiplier,
    grams:food.serving_grams===null?null:Number(food.serving_grams)*multiplier,
    protein:Number(food.protein_g)*multiplier,
    carbs:Number(food.carbohydrates_g)*multiplier,
    fat:Number(food.fat_g)*multiplier,
    calories:Number(food.calories)*multiplier,
  }
}
